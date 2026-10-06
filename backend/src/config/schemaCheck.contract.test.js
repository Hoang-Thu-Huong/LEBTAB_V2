import { describe, it, expect, afterAll, vi } from 'vitest';

vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { pool } from './db.js';
import { checkNutritionColumns } from './schemaCheck.js';

const dbUp = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch((e) => {
    console.warn(`[contract] DB nicht erreichbar, DB-Tests uebersprungen: ${e.code ?? e.message}`);
    return false;
  });
afterAll(() => pool.end());

describe.skipIf(!dbUp)('NUTRITION_COLUMNS vs. INFORMATION_SCHEMA (echte DB, nur SELECT)', () => {
  it('matches all 79 DOUBLE columns of lebtab by name, case and order', async () => {
    expect(await checkNutritionColumns(pool)).toEqual({
      ok: true,
      missingInDb: [],
      missingInCode: [],
      sameOrder: true,
    });
  });
});
