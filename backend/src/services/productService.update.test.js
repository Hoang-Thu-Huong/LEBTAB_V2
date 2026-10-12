import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 8: updateProduct (#4), previewRecalculation (#17), recalculateProduct (#6) — Pool, Models, nutritionService gemockt.
vi.mock('../config/db.js', () => ({ pool: { getConnection: vi.fn(), tag: 'pool' } }));
vi.mock('../config/schemaInfo.js', () => ({ getSchemaInfo: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../models/lebtabModel.js', () => ({
  findByLmc: vi.fn(),
  findStoredLmc: vi.fn(),
  updateColumns: vi.fn(),
}));
vi.mock('../models/czutabModel.js', () => ({ findByLmcWithZutat: vi.fn() }));
vi.mock('./nutritionService.js', () => ({ calculateNutrition: vi.fn(), recalculateNutrition: vi.fn() }));

import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import * as nutritionService from './nutritionService.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { recipeFingerprint } from '../utils/recipeFingerprint.js';
import { updateProduct, previewRecalculation, recalculateProduct } from './productService.js';

const STORED = Object.fromEntries(NUTRITION_COLUMNS.map((c) => [c, 1]));
const NEW = Object.fromEntries(NUTRITION_COLUMNS.map((c) => [c, 2]));
const ROW = {
  lebtab_lmc: 'DQCO00', lebtab_Bezeich: 'Aufstrich', lebtab_Marke: null, lebtab_Version: 3, lebtab_Itemart: 'V',
  lebtab_Datum: '2013-05-10', lebtab_aktuell: 1, lebtab_lmgruppe: null, lebtab_gruppename: null, lebtab_source: null,
  lebtab_source_code: null, lebtab_source_detail: null, lebtab_probiotisch: null,
  ...STORED, _row_version: 4, lebtab_nutrition_stale: 1, lebtab_bemerkung: null,
};
const RECIPE = [{ id: 1, LMC: 'DQCO00', LM_Zutat: 'QBP000', Menge: 1.2, Version: 3, Anrcode: 0, zutat: null }];

let conn;
let calls;
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  const track = (name) => vi.fn(async () => { calls.push(name); });
  conn = { beginTransaction: track('begin'), commit: track('commit'), rollback: track('rollback'), release: vi.fn(() => calls.push('release')) };
  pool.getConnection.mockResolvedValue(conn);
  getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: true });
  lebtabModel.findByLmc.mockResolvedValue(ROW);
  lebtabModel.findStoredLmc.mockImplementation(async () => { calls.push('stored'); return 'DQCO00'; });
  czutabModel.findByLmcWithZutat.mockResolvedValue(RECIPE);
});

describe('productService.updateProduct (#4)', () => {
  it('one UPDATE with the client version on the pool, then returns the record like #2 without ingredients', async () => {
    lebtabModel.updateColumns.mockResolvedValue(1);
    lebtabModel.findByLmc.mockResolvedValue({ ...ROW, lebtab_Marke: 'Neu', _row_version: 5 });
    const res = await updateProduct('dqco00', { changes: { lebtab_Marke: 'Neu' }, _row_version: 4 });
    expect(lebtabModel.updateColumns).toHaveBeenCalledWith('dqco00', { lebtab_Marke: 'Neu' }, 4, pool);
    expect(res).toMatchObject({ lebtab_lmc: 'DQCO00', lebtab_Marke: 'Neu', _row_version: 5, lebtab_nutrition_stale: 1 });
    expect(res.nutrition).toEqual(STORED);
    expect(res).not.toHaveProperty('ingredients');
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('0 rows -> product still there: 409 VERSION_CONFLICT with current = full record incl. ingredients', async () => {
    lebtabModel.updateColumns.mockResolvedValue(0);
    const err = await updateProduct('DQCO00', { changes: { lebtab_Marke: 'x' }, _row_version: 3 }).catch((e) => e);
    expect(err).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    expect(err.current).toMatchObject({ lebtab_lmc: 'DQCO00', _row_version: 4, ingredients: RECIPE });
  });

  it('0 rows -> product gone: 404', async () => {
    lebtabModel.updateColumns.mockResolvedValue(0);
    lebtabModel.findByLmc.mockResolvedValue(null);
    await expect(updateProduct('DQCO00', { changes: { lebtab_Marke: 'x' }, _row_version: 3 })).rejects.toMatchObject({ status: 404 });
  });

  it('malformed lmc -> 404 without DB; migration 001 missing -> 503', async () => {
    await expect(updateProduct('../x', { changes: { lebtab_Marke: 'x' }, _row_version: 1 })).rejects.toMatchObject({ status: 404 });
    expect(lebtabModel.updateColumns).not.toHaveBeenCalled();
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    await expect(updateProduct('DQCO00', { changes: { lebtab_Marke: 'x' }, _row_version: 1 })).rejects.toMatchObject({
      status: 503,
      code: 'MIGRATION_REQUIRED',
    });
  });
});

describe('productService.previewRecalculation (#17, writes nothing)', () => {
  it('returns stored values, calculated values, warnings, ingredients and the recipe version — on the pool, no transaction', async () => {
    nutritionService.calculateNutrition.mockResolvedValue({ nutrition: NEW, warnings: [{ reason: 'A_MARKER_EMPTY', LM_Zutat: 'JJJJ00' }], contributingRows: 1 });
    const res = await previewRecalculation('DQCO00');
    expect(nutritionService.calculateNutrition).toHaveBeenCalledWith(RECIPE, pool);
    expect(res).toEqual({
      lmc: 'DQCO00',
      current: STORED,
      nutrition: NEW,
      contributingRows: 1,
      warnings: [{ reason: 'A_MARKER_EMPTY', LM_Zutat: 'JJJJ00' }],
      ingredients: RECIPE,
      recipeVersion: recipeFingerprint(RECIPE),
      _row_version: 4,
      lebtab_nutrition_stale: 1,
    });
    expect(nutritionService.recalculateNutrition).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('unknown or malformed lmc -> 404; migration missing -> 503', async () => {
    lebtabModel.findByLmc.mockResolvedValue(null);
    await expect(previewRecalculation('ZZZZZ9')).rejects.toMatchObject({ status: 404 });
    await expect(previewRecalculation('a b')).rejects.toMatchObject({ status: 404 });
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    await expect(previewRecalculation('DQCO00')).rejects.toMatchObject({ status: 503 });
  });
});

describe('productService.recalculateProduct (#6)', () => {
  const RESULT = { nutrition: NEW, warnings: [], contributingRows: 1, ingredients: RECIPE };

  it('stored lmc (pool) -> one transaction: recalculateNutrition(stored, version, conn, recipeVersion) -> commit', async () => {
    nutritionService.recalculateNutrition.mockImplementation(async () => { calls.push('recalc'); return { ...RESULT, updated: true }; });
    const res = await recalculateProduct('dqco00', { _row_version: 4, recipeVersion: 'a'.repeat(40) });
    expect(calls).toEqual(['stored', 'begin', 'recalc', 'commit', 'release']);
    expect(nutritionService.recalculateNutrition).toHaveBeenCalledWith('DQCO00', 4, conn, { recipeVersion: 'a'.repeat(40) });
    expect(res).toEqual({
      nutrition: NEW, lebtab_nutrition_stale: 0, _row_version: 5, contributingRows: 1, warnings: [], ingredients: RECIPE,
    });
  });

  it('existence check runs on the pool BEFORE the transaction: first statement in the transaction is the locking read', async () => {
    nutritionService.recalculateNutrition.mockImplementation(async () => { calls.push('recalc'); return { ...RESULT, updated: true }; });
    await recalculateProduct('DQCO00', { _row_version: 4, recipeVersion: null });
    expect(lebtabModel.findStoredLmc).toHaveBeenCalledWith('DQCO00', pool);
    expect(calls.indexOf('stored')).toBeLessThan(calls.indexOf('begin'));
    expect(calls).toEqual(['stored', 'begin', 'recalc', 'commit', 'release']);
  });

  it('UPDATE without match -> rollback (never commit), then 409 VERSION_CONFLICT with current', async () => {
    nutritionService.recalculateNutrition.mockImplementation(async () => { calls.push('recalc'); return { ...RESULT, updated: false }; });
    const err = await recalculateProduct('DQCO00', { _row_version: 3, recipeVersion: null }).catch((e) => e);
    expect(calls).toEqual(['stored', 'begin', 'recalc', 'rollback', 'release']);
    expect(err).toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    expect(err.current._row_version).toBe(4);
  });

  it('product unknown -> 404 without a connection; RECIPE_CHANGED from recalculateNutrition -> rollback + rethrow', async () => {
    lebtabModel.findStoredLmc.mockImplementation(async () => { calls.push('stored'); return null; });
    await expect(recalculateProduct('ZZZZZ9', { _row_version: 1, recipeVersion: null })).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual(['stored']);
    expect(pool.getConnection).not.toHaveBeenCalled();

    calls.length = 0;
    lebtabModel.findStoredLmc.mockImplementation(async () => { calls.push('stored'); return 'DQCO00'; });
    const changed = Object.assign(new Error('x'), { status: 409, code: 'RECIPE_CHANGED' });
    nutritionService.recalculateNutrition.mockRejectedValue(changed);
    await expect(recalculateProduct('DQCO00', { _row_version: 1, recipeVersion: 'b'.repeat(40) })).rejects.toBe(changed);
    expect(calls).toEqual(['stored', 'begin', 'rollback', 'release']);
  });

  it('malformed lmc -> 404 without a connection; migration missing -> 503', async () => {
    await expect(recalculateProduct('%%', { _row_version: 1, recipeVersion: null })).rejects.toMatchObject({ status: 404 });
    expect(pool.getConnection).not.toHaveBeenCalled();
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    await expect(recalculateProduct('DQCO00', { _row_version: 1, recipeVersion: null })).rejects.toMatchObject({ status: 503 });
  });
});
