import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { logger } from '../utils/logger.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { checkNutritionColumns } from './schemaCheck.js';

const connWith = (names) => ({
  query: vi.fn().mockResolvedValue([names.map((COLUMN_NAME) => ({ COLUMN_NAME }))]),
});

beforeEach(() => vi.clearAllMocks());

describe('checkNutritionColumns', () => {
  it('reports ok when DB and code agree exactly', async () => {
    const res = await checkNutritionColumns(connWith([...NUTRITION_COLUMNS]));
    expect(res).toEqual({ ok: true, missingInDb: [], missingInCode: [], sameOrder: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns (does not throw) on a missing, an extra and a differently-cased column', async () => {
    const db = [...NUTRITION_COLUMNS];
    db[0] = 'lebtab_e_cal'; // falsche Schreibweise = fehlt + ist extra
    db.push('lebtab_NEU');
    const res = await checkNutritionColumns(connWith(db));
    expect(res.ok).toBe(false);
    expect(res.missingInDb).toEqual(['lebtab_E_CAL']);
    expect(res.missingInCode).toEqual(['lebtab_e_cal', 'lebtab_NEU']);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('detects a different order', async () => {
    const db = [...NUTRITION_COLUMNS];
    [db[0], db[1]] = [db[1], db[0]];
    const res = await checkNutritionColumns(connWith(db));
    expect(res).toMatchObject({ ok: false, missingInDb: [], missingInCode: [], sameOrder: false });
  });
});
