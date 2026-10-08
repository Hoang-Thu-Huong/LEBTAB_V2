/**
 * Zutaten-Logik (docs/SPEC.md 5.2, 5.3, 5.4, 5.5, 6.1 #7–#9). Phase 6: Referenzpruefung fuer createProduct;
 * Phase 7: Hinzufuegen, Menge aendern, Loeschen (mit Archiv) einer Rezepturzeile — jede Aenderung setzt NUR
 * lebtab_nutrition_stale = 1 und berechnet NIE neu. Importiert NIE nutritionService (docs/SPEC.md 5.2).
 */
import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import { AppError } from '../utils/AppError.js';
import { productNotFound, ingredientRowNotFound } from '../utils/productErrors.js';
import { INGREDIENT_MAX_PER_PRODUCT } from '../utils/limits.js';
import { isValidLmc, parseIngredientId } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import * as archiveModel from '../models/archiveModel.js';

/** c_zutab.Version fuer app-erzeugte Zeilen: 0, bis die Fachseite die Bedeutung klaert (DECISIONS #42, #90). */
export const NEW_ROW_VERSION = 0;
/** c_zutab.Anrcode fuer app-erzeugte Zeilen: 0 (NOT NULL, keine Logik — docs/DATA.md 4.2). */
export const NEW_ROW_ANRCODE = 0;
/** Wert von lebtab_nutrition_stale nach jeder Rezepturaenderung (docs/SPEC.md 5.2). */
const STALE = 1;

function migrationRequired(number) {
  return new AppError(503, 'MIGRATION_REQUIRED', `Datenbank-Migration ${number} wurde noch nicht ausgeführt`);
}

function validationError(field, issue) {
  return new AppError(400, 'VALIDATION_ERROR', 'Ungültige Eingabedaten', [{ field, issue }]);
}

/** Welche der Codes existieren? Map klein geschriebener Code -> Schreibweise in der DB (Kollation _ci). */
async function lookupStored(codes, conn) {
  const stored = await lebtabModel.findStoredLmcs(codes, conn);
  return new Map(stored.map((lmc) => [lmc.toLowerCase(), lmc]));
}

/**
 * Harte Referenzpruefung fuer NEUE Rezepturzeilen (docs/SPEC.md 5.4): jede LM_Zutat muss als Produkt existieren —
 * jede Itemart, auch A. EINE Abfrage fuer alle Codes. Liefert die Zeilen mit lebtab_lmc in DB-Schreibweise.
 * @param {Array<{LM_Zutat: string, Menge: number}>} ingredients bereits validiert (parseCreateProductBody)
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<Array<{LM_Zutat: string, Menge: number}>>}
 * @throws {AppError} 400 INGREDIENT_NOT_FOUND mit details fuer jede fehlende Zeile
 */
export async function validateIngredientRefs(ingredients, conn) {
  if (ingredients.length === 0) return [];
  const byKey = await lookupStored(ingredients.map((row) => row.LM_Zutat), conn);
  const details = [];
  const missing = [];
  const resolved = ingredients.map((row, index) => {
    const lmc = byKey.get(row.LM_Zutat.toLowerCase());
    if (lmc === undefined) {
      missing.push(row.LM_Zutat);
      details.push({ field: `ingredients[${index}].LM_Zutat`, issue: `Zutat ${row.LM_Zutat} existiert nicht` });
      return row;
    }
    return { ...row, LM_Zutat: lmc };
  });
  if (missing.length > 0) {
    throw new AppError(400, 'INGREDIENT_NOT_FOUND', `Zutat ${missing[0]} existiert nicht`, details);
  }
  return resolved;
}

/**
 * Referenzpruefung fuer EINE Zutat (#7): wie validateIngredientRefs, aber details.field = 'LM_Zutat'.
 * @param {string} code
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<string>} Schreibweise in der DB
 * @throws {AppError} 400 INGREDIENT_NOT_FOUND
 */
export async function resolveIngredientRef(code, conn) {
  const stored = (await lookupStored([code], conn)).get(code.toLowerCase());
  if (stored === undefined) {
    const issue = `Zutat ${code} existiert nicht`;
    throw new AppError(400, 'INGREDIENT_NOT_FOUND', issue, [{ field: 'LM_Zutat', issue }]);
  }
  return stored;
}

/** Eine Transaktion um work(conn); Rollback-Fehler verdecken nie den Ursprungsfehler (docs/ARCHITECTURE.md 3.2). */
async function runInTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
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
}

/** :lmc -> Schreibweise in der DB; falsch geformt oder unbekannt -> 404 (DECISIONS #55). */
async function resolveProductLmc(lmc, conn) {
  const stored = await lebtabModel.findStoredLmc(lmc, conn);
  if (stored === null) throw productNotFound();
  return stored;
}

/** Zeile per id mit Sperre; muss zu :lmc gehoeren (docs/SPEC.md #8: kein Zugriff auf fremde Zeilen per geratener id). */
async function lockOwnedRow(id, storedLmc, conn) {
  const row = await czutabModel.findByIdForUpdate(id, conn);
  if (row === null || row.LMC.toLowerCase() !== storedLmc.toLowerCase()) throw ingredientRowNotFound();
  return row;
}

/** stale = 1 auf dem Produkt; 0 betroffene Zeilen = Produkt wurde zwischenzeitlich geloescht -> 404 + Rollback. */
async function markStale(storedLmc, conn) {
  if ((await lebtabModel.setNutritionStale(storedLmc, conn)) === 0) throw productNotFound();
}

async function requireMigration(number) {
  const info = await getSchemaInfo();
  if (!info.technicalColumns) throw migrationRequired('001');
  if (number === '002' && !info.archive) throw migrationRequired('002');
}

/**
 * #7 POST /api/products/:lmc/ingredients — fuegt EINE Rezepturzeile hinzu, ohne Neuberechnung (docs/SPEC.md 5.2).
 * Reihenfolge in einer Transaktion: Produkt (404) -> Eigenreferenz (400) -> Obergrenze (400) -> Zutat existiert
 * (400 INGREDIENT_NOT_FOUND) -> Paar schon vorhanden und kein confirmDuplicate -> 200 Warnung ohne INSERT
 * (docs/SPEC.md 5.3) -> INSERT -> stale = 1.
 * @param {string} lmc aus der URL
 * @param {import('../utils/ingredientPayload.js').AddIngredientInput} input
 * @returns {Promise<(import('../models/czutabModel.js').IngredientRow & {lebtab_nutrition_stale: 1})
 *   | {warning: 'DUPLICATE_INGREDIENT', existing: Array<{id: number, Menge: number}>, needConfirm: true}>}
 * @throws {AppError} 503 MIGRATION_REQUIRED · 404 PRODUCT_NOT_FOUND · 400 VALIDATION_ERROR · 400 INGREDIENT_NOT_FOUND
 */
export async function addIngredient(lmc, { LM_Zutat, Menge, confirmDuplicate }) {
  await requireMigration('001');
  if (!isValidLmc(lmc)) throw productNotFound();
  return runInTransaction(async (conn) => {
    const storedLmc = await resolveProductLmc(lmc, conn);
    if (LM_Zutat.toLowerCase() === storedLmc.toLowerCase()) {
      throw validationError('LM_Zutat', 'ein Produkt kann nicht seine eigene Zutat sein');
    }
    if ((await czutabModel.countByLmc(storedLmc, conn)) >= INGREDIENT_MAX_PER_PRODUCT) {
      throw validationError('LM_Zutat', `höchstens ${INGREDIENT_MAX_PER_PRODUCT} Zutaten je Produkt`);
    }
    const storedZutat = await resolveIngredientRef(LM_Zutat, conn);
    const existing = await czutabModel.findByLmcAndZutat(storedLmc, storedZutat, conn);
    if (existing.length > 0 && !confirmDuplicate) {
      return { warning: 'DUPLICATE_INGREDIENT', existing, needConfirm: true };
    }
    const id = await czutabModel.insert(
      { LMC: storedLmc, LM_Zutat: storedZutat, Menge, Version: NEW_ROW_VERSION, Anrcode: NEW_ROW_ANRCODE },
      conn,
    );
    await markStale(storedLmc, conn);
    const row = await czutabModel.findByIdWithZutat(id, conn);
    logger.info('Zutat hinzugefügt', { lmc: storedLmc, id, LM_Zutat: storedZutat, duplicate: existing.length > 0 });
    return { ...row, lebtab_nutrition_stale: STALE };
  });
}

/**
 * #8 PUT /api/products/:lmc/ingredients/:id — aendert NUR Menge; Version/Anrcode bleiben (docs/SPEC.md 5.7).
 * Kein _row_version (docs/SPEC.md 5.6); zwei Benutzer auf derselben Zeile: der letzte gewinnt (DECISIONS #34).
 * @param {string} lmc aus der URL
 * @param {string} idParam aus der URL
 * @param {import('../utils/ingredientPayload.js').UpdateIngredientInput} input
 * @returns {Promise<import('../models/czutabModel.js').IngredientRow & {lebtab_nutrition_stale: 1}>}
 * @throws {AppError} 503 MIGRATION_REQUIRED · 404 PRODUCT_NOT_FOUND (Produkt, Zeile, oder Zeile gehoert nicht zu :lmc)
 */
export async function updateIngredient(lmc, idParam, { Menge }) {
  await requireMigration('001');
  if (!isValidLmc(lmc)) throw productNotFound();
  const id = parseIngredientId(idParam);
  if (id === null) throw ingredientRowNotFound();
  return runInTransaction(async (conn) => {
    const storedLmc = await resolveProductLmc(lmc, conn);
    await lockOwnedRow(id, storedLmc, conn);
    await czutabModel.updateMenge(id, Menge, conn);
    await markStale(storedLmc, conn);
    const row = await czutabModel.findByIdWithZutat(id, conn);
    logger.info('Zutat geändert', { lmc: storedLmc, id, Menge });
    return { ...row, lebtab_nutrition_stale: STALE };
  });
}

/**
 * #9 DELETE /api/products/:lmc/ingredients/:id — Soft-Delete: Kopie nach c_zutab_archive (lebtab_archive_id NULL),
 * dann DELETE, dann stale = 1 — alles in EINER Transaktion (docs/SPEC.md 5.5, docs/DATA.md 4.0).
 * @param {string} lmc aus der URL
 * @param {string} idParam aus der URL
 * @returns {Promise<{deleted: true, id: number, lebtab_nutrition_stale: 1}>}
 * @throws {AppError} 503 MIGRATION_REQUIRED (001 oder 002) · 404 PRODUCT_NOT_FOUND
 */
export async function deleteIngredient(lmc, idParam) {
  await requireMigration('002');
  if (!isValidLmc(lmc)) throw productNotFound();
  const id = parseIngredientId(idParam);
  if (id === null) throw ingredientRowNotFound();
  return runInTransaction(async (conn) => {
    const storedLmc = await resolveProductLmc(lmc, conn);
    const row = await lockOwnedRow(id, storedLmc, conn);
    await archiveModel.insertIngredientArchive(row, null, conn);
    await czutabModel.deleteById(id, conn);
    await markStale(storedLmc, conn);
    logger.info('Zutat archiviert', { lmc: storedLmc, id, LM_Zutat: row.LM_Zutat });
    return { deleted: true, id, lebtab_nutrition_stale: STALE };
  });
}
