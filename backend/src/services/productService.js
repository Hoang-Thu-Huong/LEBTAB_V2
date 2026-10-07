import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import { AppError } from '../utils/AppError.js';
import { productNotFound } from '../utils/productErrors.js';
import { parseListQuery } from '../utils/listQuery.js';
import { isValidLmc } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import {
  BASIC_COLUMNS,
  CLASSIFICATION_COLUMNS,
  TECHNICAL_COLUMNS,
  TECHNICAL_DEFAULTS,
} from '../utils/productColumns.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { calculateNutrition } from './nutritionService.js';
import { validateIngredientRefs, NEW_ROW_VERSION, NEW_ROW_ANRCODE } from './ingredientService.js';

/**
 * Baut aus der flachen DB-Zeile die Antwort von #2: 13 Spalten an der Wurzel, nutrition{79}, ingredients,
 * 3 technische Schluessel (Defaults 1/0/null, solange Migration 001 nicht gelaufen ist — DECISIONS #57).
 * @param {Record<string, unknown>} row
 * @param {import('../models/czutabModel.js').IngredientRow[]} ingredients
 * @returns {Record<string, unknown>}
 */
function shapeProduct(row, ingredients) {
  const product = {};
  for (const column of [...BASIC_COLUMNS, ...CLASSIFICATION_COLUMNS]) product[column] = row[column];
  product.nutrition = {};
  for (const column of NUTRITION_COLUMNS) product.nutrition[column] = row[column];
  product.ingredients = ingredients;
  for (const column of TECHNICAL_COLUMNS) product[column] = row[column] ?? TECHNICAL_DEFAULTS[column];
  return product;
}

/**
 * Produktliste mit Filtern und Paging (docs/SPEC.md 6.1 #1).
 * @param {Record<string, unknown>} query req.query
 * @returns {Promise<{items: object[], total: number, page: number, pageSize: number}>}
 * @throws {AppError} 400 VALIDATION_ERROR
 */
export async function listProducts(query) {
  const { filters, page, pageSize } = parseListQuery(query);
  const [items, total] = await Promise.all([
    lebtabModel.findPage(filters, { limit: pageSize, offset: (page - 1) * pageSize }, pool),
    lebtabModel.count(filters, pool),
  ]);
  return { items, total, page, pageSize };
}

/**
 * Produktdetails inkl. Rezeptur (docs/SPEC.md 6.1 #2). Falsch geformte lmc -> 404 ohne DB-Zugriff (DECISIONS #55).
 * @param {string} lmc
 * @returns {Promise<Record<string, unknown>>}
 * @throws {AppError} 404 PRODUCT_NOT_FOUND
 */
export async function getProduct(lmc) {
  if (!isValidLmc(lmc)) throw productNotFound();
  const { technicalColumns } = await getSchemaInfo();
  const [row, ingredients] = await Promise.all([
    lebtabModel.findByLmc(lmc, { technicalColumns }, pool),
    czutabModel.findByLmcWithZutat(lmc, pool),
  ]);
  if (!row) throw productNotFound();
  return shapeProduct(row, ingredients);
}

/**
 * Existenzpruefung fuer HEAD #2b. Falsch geformte lmc -> false ohne DB-Zugriff.
 * @param {string} lmc
 * @returns {Promise<boolean>}
 */
export async function productExists(lmc) {
  if (!isValidLmc(lmc)) return false;
  return (await lebtabModel.findStoredLmc(lmc, pool)) !== null;
}

function lmcAlreadyExists() {
  return new AppError(409, 'LMC_ALREADY_EXISTS', 'Die Produktnummer existiert bereits');
}

/**
 * Legt ein Produkt samt Rezeptur an und berechnet die Naehrwerte SOFORT (docs/SPEC.md 5.2, 6.1 #3) — der einzige
 * Weg neben #6. Eine Transaktion: Existenz (409) -> Zutaten muessen existieren (400 INGREDIENT_NOT_FOUND) ->
 * calculateNutrition -> INSERT lebtab -> INSERT c_zutab. Der PRIMARY KEY faengt das Race zweier gleichzeitiger
 * Anlagen ab (ER_DUP_ENTRY -> 409). Ruft nie recalculateNutrition (zu diesem Zeitpunkt existiert noch nichts).
 * @param {import('../utils/productPayload.js').CreateProductInput} input Ergebnis von parseCreateProductBody
 * @returns {Promise<{lmc: string, nutrition: Record<string, number|null>, _row_version: number,
 *   warnings: import('./nutritionService.js').NutritionWarning[]}>}
 * @throws {AppError} 503 MIGRATION_REQUIRED · 409 LMC_ALREADY_EXISTS · 400 INGREDIENT_NOT_FOUND
 */
export async function createProduct({ product, ingredients }) {
  const { technicalColumns } = await getSchemaInfo();
  if (!technicalColumns) {
    throw new AppError(503, 'MIGRATION_REQUIRED', 'Datenbank-Migration 001 wurde noch nicht ausgeführt');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if ((await lebtabModel.findStoredLmc(product.lebtab_lmc, conn)) !== null) throw lmcAlreadyExists();
    const rows = await validateIngredientRefs(ingredients, conn);
    const { nutrition, warnings } = await calculateNutrition(rows, conn);
    await lebtabModel.insert({ ...product, ...nutrition }, conn);
    await czutabModel.insertMany(
      rows.map((row) => ({
        LMC: product.lebtab_lmc,
        LM_Zutat: row.LM_Zutat,
        Menge: row.Menge,
        Version: NEW_ROW_VERSION,
        Anrcode: NEW_ROW_ANRCODE,
      })),
      conn,
    );
    await conn.commit();
    logger.info('Produkt angelegt', { lmc: product.lebtab_lmc, zutaten: rows.length, warnings: warnings.length });
    return { lmc: product.lebtab_lmc, nutrition, _row_version: TECHNICAL_DEFAULTS._row_version, warnings };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* Verbindung bereits weg — der urspruengliche Fehler zaehlt */
    }
    if (err.code === 'ER_DUP_ENTRY') throw lmcAlreadyExists();
    throw err;
  } finally {
    conn.release();
  }
}
