import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import { AppError } from '../utils/AppError.js';
import { productNotFound, versionConflict } from '../utils/productErrors.js';
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
import { recipeFingerprint } from '../utils/recipeFingerprint.js';
import { calculateNutrition, recalculateNutrition } from './nutritionService.js';
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

/** #3, #4, #6, #17 brauchen die 3 technischen Spalten aus Migration 001 (docs/ARCHITECTURE.md 3.2). */
async function requireTechnicalColumns() {
  const { technicalColumns } = await getSchemaInfo();
  if (!technicalColumns) {
    throw new AppError(503, 'MIGRATION_REQUIRED', 'Datenbank-Migration 001 wurde noch nicht ausgeführt');
  }
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
  await requireTechnicalColumns();
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

/**
 * Nach einem UPDATE ohne Treffer (docs/SPEC.md 5.6): Produkt weg -> 404, sonst 409 mit dem aktuellen Datensatz wie #2.
 * @param {string} lmc
 * @returns {Promise<import('../utils/AppError.js').AppError>}
 */
async function conflictOrNotFound(lmc) {
  const [row, ingredients] = await Promise.all([
    lebtabModel.findByLmc(lmc, { technicalColumns: true }, pool),
    czutabModel.findByLmcWithZutat(lmc, pool),
  ]);
  return row ? versionConflict(shapeProduct(row, ingredients)) : productNotFound();
}

/**
 * PUT #4 — Stammdaten bzw. Bemerkung aendern (PATCH-Semantik, docs/SPEC.md 6.1 #4, 5.10), optimistische Sperre.
 * Ein einziges UPDATE, keine Transaktion noetig. Antwort = Datensatz wie #2 ohne ingredients, mit neuer _row_version.
 * @param {string} lmc aus der URL
 * @param {import('../utils/productPayload.js').UpdateProductInput} input Ergebnis von parseUpdateProductBody
 * @returns {Promise<Record<string, unknown>>}
 * @throws {AppError} 503 MIGRATION_REQUIRED · 404 PRODUCT_NOT_FOUND · 409 VERSION_CONFLICT (mit current)
 */
export async function updateProduct(lmc, { changes, _row_version }) {
  await requireTechnicalColumns();
  if (!isValidLmc(lmc)) throw productNotFound();
  const affected = await lebtabModel.updateColumns(lmc, changes, _row_version, pool);
  if (affected === 0) throw await conflictOrNotFound(lmc);
  const row = await lebtabModel.findByLmc(lmc, { technicalColumns: true }, pool);
  if (!row) throw productNotFound(); // direkt danach geloescht
  logger.info('Produkt geaendert', { lmc: row.lebtab_lmc, spalten: Object.keys(changes) });
  const { ingredients: _none, ...product } = shapeProduct(row, []);
  return product;
}

/**
 * #17 GET /api/products/:lmc/recalculation — Vorschau fuer den Dialog "Neu berechnen & speichern" (docs/SPEC.md 5.9):
 * berechnet aus der aktuellen Rezeptur, SCHREIBT NIE. current = gespeicherte 79 Werte; recipeVersion geht beim
 * Speichern (#6) mit, damit niemand zwischen Vorschau und Speichern die Rezeptur geaendert hat.
 * @param {string} lmc
 * @returns {Promise<{lmc: string, current: Record<string, number|null>, nutrition: Record<string, number|null>,
 *   contributingRows: number, warnings: import('./nutritionService.js').NutritionWarning[],
 *   ingredients: import('../models/czutabModel.js').IngredientRow[], recipeVersion: string, _row_version: number,
 *   lebtab_nutrition_stale: number}>}
 * @throws {AppError} 503 MIGRATION_REQUIRED · 404 PRODUCT_NOT_FOUND
 */
export async function previewRecalculation(lmc) {
  await requireTechnicalColumns();
  if (!isValidLmc(lmc)) throw productNotFound();
  const [row, ingredients] = await Promise.all([
    lebtabModel.findByLmc(lmc, { technicalColumns: true }, pool),
    czutabModel.findByLmcWithZutat(lmc, pool),
  ]);
  if (!row) throw productNotFound();
  const { nutrition, warnings, contributingRows } = await calculateNutrition(ingredients, pool);
  const current = Object.fromEntries(NUTRITION_COLUMNS.map((column) => [column, row[column]]));
  return {
    lmc: row.lebtab_lmc,
    current,
    nutrition,
    contributingRows,
    warnings,
    ingredients,
    recipeVersion: recipeFingerprint(ingredients),
    _row_version: row._row_version,
    lebtab_nutrition_stale: row.lebtab_nutrition_stale,
  };
}

/**
 * #6 POST /api/products/:lmc/recalculate — der EINZIGE Weg, Naehrwerte eines bestehenden Produkts neu zu berechnen
 * (docs/SPEC.md 5.2). Eine Transaktion: Produkt (404) -> recalculateNutrition (sperrt c_zutab, prueft recipeVersion,
 * schreibt lebtab). UPDATE ohne Treffer -> Rollback, dann 404 oder 409 VERSION_CONFLICT.
 * @param {string} lmc
 * @param {{_row_version: number, recipeVersion: string|null}} input Ergebnis von parseRecalculateBody
 * @returns {Promise<{nutrition: Record<string, number|null>, lebtab_nutrition_stale: 0, _row_version: number,
 *   contributingRows: number, warnings: import('./nutritionService.js').NutritionWarning[],
 *   ingredients: import('../models/czutabModel.js').IngredientRow[]}>}
 * @throws {AppError} 503 MIGRATION_REQUIRED · 404 PRODUCT_NOT_FOUND · 409 VERSION_CONFLICT · 409 RECIPE_CHANGED
 */
export async function recalculateProduct(lmc, { _row_version, recipeVersion }) {
  await requireTechnicalColumns();
  if (!isValidLmc(lmc)) throw productNotFound();
  // Existenzpruefung auf dem Pool, VOR der Transaktion: unter REPEATABLE READ legt schon der erste nicht sperrende
  // Lesezugriff die Read View an, und die Rezeptur nach dem Lock waere dann der alte Stand (RECIPE_CHANGED verpasst).
  // Das erste Statement in der Transaktion muss das sperrende lockByLmc sein. Produkt dazwischen geloescht ->
  // updated: false -> conflictOrNotFound -> 404.
  const storedLmc = await lebtabModel.findStoredLmc(lmc, pool);
  if (storedLmc === null) throw productNotFound();
  const conn = await pool.getConnection();
  let result;
  try {
    await conn.beginTransaction();
    result = await recalculateNutrition(storedLmc, _row_version, conn, { recipeVersion });
    if (result.updated) await conn.commit();
    else await conn.rollback();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* Verbindung bereits weg — der urspruengliche Fehler zaehlt */
    }
    throw err;
  } finally {
    conn.release();
  }
  if (!result.updated) throw await conflictOrNotFound(storedLmc);
  logger.info('Naehrwerte neu berechnet', {
    lmc: storedLmc,
    contributingRows: result.contributingRows,
    warnings: result.warnings.length,
  });
  return {
    nutrition: result.nutrition,
    lebtab_nutrition_stale: 0,
    _row_version: _row_version + 1,
    contributingRows: result.contributingRows,
    warnings: result.warnings,
    ingredients: result.ingredients,
  };
}
