import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../config/db.js';
import { LEBTAB_EXPORT_COLUMNS } from './exportColumns.js';
import { TECHNICAL_COLUMNS } from './productColumns.js';

const dbUp = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch((e) => {
    console.warn(`[contract] DB nicht erreichbar, DB-Tests uebersprungen: ${e.code ?? e.message}`);
    return false;
  });
afterAll(() => pool.end());

describe.skipIf(!dbUp)('LEBTAB_EXPORT_COLUMNS vs. INFORMATION_SCHEMA (echte DB, nur SELECT)', () => {
  // 5 Basisspalten heissen physisch klein (docs/DATA.md 4.0) -> Namen ohne Beachtung der Gross-/Kleinschreibung vergleichen.
  it('lists all original columns of lebtab in table order', async () => {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lebtab'
        ORDER BY ORDINAL_POSITION`,
    );
    const technical = new Set(TECHNICAL_COLUMNS.map((column) => column.toLowerCase()));
    const original = rows.map((row) => row.name.toLowerCase()).filter((name) => !technical.has(name));
    expect(original).toEqual(LEBTAB_EXPORT_COLUMNS.map((column) => column.toLowerCase()));
  });
});
