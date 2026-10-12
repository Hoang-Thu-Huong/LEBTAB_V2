import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Phase 8: PUT #4, GET #17, POST #6 durch die ganze Kette (Route -> validateRequest -> Service -> nutritionService),
// OHNE Datenbank (ARCH 8.3 #9): Pool + Models + schemaInfo gemockt.
vi.mock('../config/db.js', () => ({ pool: { getConnection: vi.fn(), query: vi.fn() } }));
vi.mock('../config/schemaInfo.js', () => ({ getSchemaInfo: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../models/lebtabModel.js', () => ({
  findByLmc: vi.fn(),
  findStoredLmc: vi.fn(),
  findNutritionByLmcs: vi.fn(),
  updateColumns: vi.fn(),
  updateNutrition: vi.fn(),
}));
vi.mock('../models/czutabModel.js', () => ({ findByLmcWithZutat: vi.fn(), lockByLmc: vi.fn() }));

import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { recipeFingerprint } from '../utils/recipeFingerprint.js';
import { createApp } from '../app.js';

const app = createApp();

function reference(lmc, itemart, value) {
  const row = { lebtab_lmc: lmc, lebtab_Itemart: itemart };
  for (const c of NUTRITION_COLUMNS) row[c] = value;
  return row;
}
const STORED = Object.fromEntries(NUTRITION_COLUMNS.map((c) => [c, 3]));
const ROW = {
  lebtab_lmc: 'DQCO00', lebtab_Bezeich: 'Aufstrich', lebtab_Marke: null, lebtab_Version: 3, lebtab_Itemart: 'V',
  lebtab_Datum: '2013-05-10', lebtab_aktuell: 1, lebtab_lmgruppe: null, lebtab_gruppename: null, lebtab_source: null,
  lebtab_source_code: null, lebtab_source_detail: null, lebtab_probiotisch: null,
  ...STORED, _row_version: 4, lebtab_nutrition_stale: 1, lebtab_bemerkung: null,
};
const RECIPE = [
  { id: 21, LMC: 'DQCO00', LM_Zutat: 'QBP000', Menge: 50, Version: 3, Anrcode: 0, zutat: { lebtab_Bezeich: 'Meersalz', lebtab_Itemart: 'L' } },
  { id: 22, LMC: 'DQCO00', LM_Zutat: 'OHB000', Menge: 0, Version: 3, Anrcode: 0, zutat: { lebtab_Bezeich: 'Wasser', lebtab_Itemart: 'L' } },
];

let conn;
beforeEach(() => {
  vi.clearAllMocks();
  conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
  getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: true });
  lebtabModel.findByLmc.mockResolvedValue(ROW);
  lebtabModel.findStoredLmc.mockResolvedValue('DQCO00');
  lebtabModel.findNutritionByLmcs.mockResolvedValue([reference('QBP000', 'L', 10)]);
  lebtabModel.updateColumns.mockResolvedValue(1);
  lebtabModel.updateNutrition.mockResolvedValue(1);
  czutabModel.findByLmcWithZutat.mockResolvedValue(RECIPE);
  czutabModel.lockByLmc.mockResolvedValue(2);
});

describe('PUT /api/products/:lmc (#4)', () => {
  const put = (body, lmc = 'DQCO00') => request(app).put(`/api/products/${lmc}`).send(body);

  it('200: record like #2 without ingredients; only present whitelist keys reach the UPDATE', async () => {
    lebtabModel.findByLmc.mockResolvedValue({ ...ROW, lebtab_bemerkung: 'Notiz', _row_version: 5 });
    const res = await put({ lebtab_bemerkung: 'Notiz', lebtab_EW: 99, _row_version: 4 });
    expect(res.status).toBe(200);
    expect(lebtabModel.updateColumns).toHaveBeenCalledWith('DQCO00', { lebtab_bemerkung: 'Notiz' }, 4, pool);
    expect(res.body).toMatchObject({ lebtab_lmc: 'DQCO00', lebtab_bemerkung: 'Notiz', _row_version: 5 });
    expect(Object.keys(res.body.nutrition)).toEqual([...NUTRITION_COLUMNS]);
    expect(res.body).not.toHaveProperty('ingredients');
  });

  it('400 VALIDATION_ERROR before any DB access: no _row_version, NOT NULL column null, no column at all', async () => {
    const res = await put({ lebtab_Bezeich: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(res.body.error.details).toEqual([
      { field: '_row_version', issue: 'fehlt' },
      { field: 'lebtab_Bezeich', issue: 'darf nicht leer sein' },
    ]);
    expect((await put({ _row_version: 4 })).status).toBe(400);
    expect(getSchemaInfo).not.toHaveBeenCalled();
    expect(lebtabModel.updateColumns).not.toHaveBeenCalled();
  });

  it('409 VERSION_CONFLICT with current (full record incl. ingredients) at the root', async () => {
    lebtabModel.updateColumns.mockResolvedValue(0);
    const res = await put({ lebtab_Marke: 'x', _row_version: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
    expect(res.body.current).toMatchObject({ lebtab_lmc: 'DQCO00', _row_version: 4 });
    expect(res.body.current.ingredients).toHaveLength(2);
  });

  it('404 for an unknown product (UPDATE 0 rows + SELECT empty) and for a malformed :lmc', async () => {
    lebtabModel.updateColumns.mockResolvedValue(0);
    lebtabModel.findByLmc.mockResolvedValue(null);
    expect((await put({ lebtab_Marke: 'x', _row_version: 1 }, 'ZZZZZ9')).status).toBe(404);
    expect((await put({ lebtab_Marke: 'x', _row_version: 1 }, 'ab')).body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('503 MIGRATION_REQUIRED when migration 001 is missing', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    expect((await put({ lebtab_Marke: 'x', _row_version: 1 })).body.error.code).toBe('MIGRATION_REQUIRED');
  });
});

describe('GET /api/products/:lmc/recalculation (#17, preview — never writes)', () => {
  it('200: current vs. calculated, warnings, ingredients, recipeVersion; no transaction, no UPDATE', async () => {
    const res = await request(app).get('/api/products/DQCO00/recalculation');
    expect(res.status).toBe(200);
    expect(res.body.current).toEqual(STORED);
    expect(res.body.nutrition[NUTRITION_COLUMNS[0]]).toBe(5); // 50 × 10 / 100; Menge 0 nimmt nicht teil
    expect(res.body).toMatchObject({
      lmc: 'DQCO00', contributingRows: 1, warnings: [], _row_version: 4, lebtab_nutrition_stale: 1,
      recipeVersion: recipeFingerprint(RECIPE),
    });
    expect(res.body.ingredients).toHaveLength(2);
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(lebtabModel.updateNutrition).not.toHaveBeenCalled();
  });

  it('404 for an unknown product', async () => {
    lebtabModel.findByLmc.mockResolvedValue(null);
    expect((await request(app).get('/api/products/ZZZZZ9/recalculation')).status).toBe(404);
  });
});

describe('POST /api/products/:lmc/recalculate (#6)', () => {
  const post = (body) => request(app).post('/api/products/DQCO00/recalculate').send(body);

  it('200 { nutrition, stale 0, _row_version n+1, contributingRows, warnings, ingredients } — committed', async () => {
    const res = await post({ _row_version: 4, recipeVersion: recipeFingerprint(RECIPE) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lebtab_nutrition_stale: 0, _row_version: 5, contributingRows: 1, warnings: [] });
    expect(res.body.nutrition[NUTRITION_COLUMNS[0]]).toBe(5);
    expect(res.body.ingredients).toHaveLength(2);
    expect(lebtabModel.updateNutrition).toHaveBeenCalledWith('DQCO00', res.body.nutrition, 4, conn);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('409 RECIPE_CHANGED when the recipe differs from the preview — nothing written, rolled back', async () => {
    const res = await post({ _row_version: 4, recipeVersion: 'c'.repeat(40) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RECIPE_CHANGED');
    expect(lebtabModel.updateNutrition).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('409 VERSION_CONFLICT with current when _row_version is stale', async () => {
    lebtabModel.updateNutrition.mockResolvedValue(0);
    const res = await post({ _row_version: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    expect(res.body.current._row_version).toBe(4);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('400 without _row_version or with a malformed recipeVersion (before any DB access)', async () => {
    expect((await post({})).body.error.details).toEqual([{ field: '_row_version', issue: 'fehlt' }]);
    expect((await post({ _row_version: 1, recipeVersion: 'xyz' })).status).toBe(400);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});
