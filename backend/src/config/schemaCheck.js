import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { logger } from '../utils/logger.js';

/**
 * Vergleicht NUTRITION_COLUMNS mit den DOUBLE-Spalten von lebtab in INFORMATION_SCHEMA (docs/DATA.md 4.1):
 * Namen (Gross-/Kleinschreibung exakt) und Reihenfolge. Abweichung -> nur WARNUNG im Log, kein Absturz.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<{ok: boolean, missingInDb: string[], missingInCode: string[], sameOrder: boolean}>}
 */
export async function checkNutritionColumns(conn) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lebtab' AND DATA_TYPE = 'double'
     ORDER BY ORDINAL_POSITION`,
  );
  const dbColumns = rows.map((row) => row.COLUMN_NAME);
  const missingInDb = NUTRITION_COLUMNS.filter((c) => !dbColumns.includes(c));
  const missingInCode = dbColumns.filter((c) => !NUTRITION_COLUMNS.includes(c));
  const sameOrder =
    dbColumns.length === NUTRITION_COLUMNS.length &&
    dbColumns.every((c, i) => c === NUTRITION_COLUMNS[i]);
  const result = {
    ok: missingInDb.length === 0 && missingInCode.length === 0 && sameOrder,
    missingInDb,
    missingInCode,
    sameOrder,
  };
  if (result.ok) {
    logger.info('Naehrwertspalten stimmen mit der Datenbank ueberein', { count: dbColumns.length });
  } else {
    logger.warn('NUTRITION_COLUMNS weicht von INFORMATION_SCHEMA ab', result);
  }
  return result;
}
