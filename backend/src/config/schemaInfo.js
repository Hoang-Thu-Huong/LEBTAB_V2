import { pool } from './db.js';
import { logger } from '../utils/logger.js';

const TECHNICAL_COLUMNS = ['_row_version', 'lebtab_nutrition_stale', 'lebtab_bemerkung'];

/** @type {{technicalColumns: boolean, archive: boolean} | null} */
let cached = null;

/**
 * Liest einmal pro Prozess, ob Migration 001 (3 technische Spalten) und 002 (Archiv-Tabellen) ausgefuehrt wurden
 * (docs/ARCHITECTURE.md 3.2, docs/OPERATIONS.md 4.6). Nach dem Ausfuehren einer Migration: Server neu starten.
 * @returns {Promise<{technicalColumns: boolean, archive: boolean}>}
 */
export async function getSchemaInfo() {
  if (cached) return cached;
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lebtab' AND COLUMN_NAME IN (?)`,
    [TECHNICAL_COLUMNS],
  );
  const [tables] = await pool.query(`SHOW TABLES LIKE 'lebtab_archive'`);
  cached = { technicalColumns: cols.length === TECHNICAL_COLUMNS.length, archive: tables.length === 1 };
  logger.info('Schema-Status', cached);
  return cached;
}

/** Nur fuer Tests. */
export function resetSchemaInfoCache() {
  cached = null;
}
