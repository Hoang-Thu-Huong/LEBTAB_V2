import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import { AppError } from '../utils/AppError.js';
import { parseListQuery } from '../utils/listQuery.js';
import { isValidLmc } from '../utils/validators.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import {
  BASIC_COLUMNS,
  CLASSIFICATION_COLUMNS,
  TECHNICAL_COLUMNS,
  TECHNICAL_DEFAULTS,
} from '../utils/productColumns.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';

function productNotFound() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'Produkt nicht gefunden');
}

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
  return lebtabModel.exists(lmc, pool);
}
