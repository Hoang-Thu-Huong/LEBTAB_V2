import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 6: createProduct — eigene Datei, weil hier pool.getConnection() + Transaktion gemockt werden.
vi.mock('../config/db.js', () => ({ pool: { getConnection: vi.fn() } }));
vi.mock('../config/schemaInfo.js', () => ({ getSchemaInfo: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../models/lebtabModel.js', () => ({
  findPage: vi.fn(),
  count: vi.fn(),
  findByLmc: vi.fn(),
  findStoredLmc: vi.fn(),
  findStoredLmcs: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('../models/czutabModel.js', () => ({ findByLmcWithZutat: vi.fn(), insertMany: vi.fn() }));
vi.mock('./nutritionService.js', () => ({ calculateNutrition: vi.fn(), recalculateNutrition: vi.fn() }));

import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import { logger } from '../utils/logger.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import * as nutritionService from './nutritionService.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { createProduct } from './productService.js';

const PRODUCT = {
  lebtab_lmc: 'ZZT001', lebtab_Bezeich: 'Test', lebtab_Marke: null, lebtab_Version: null, lebtab_Itemart: 'V',
  lebtab_Datum: '2026-10-06', lebtab_aktuell: 1, lebtab_lmgruppe: null, lebtab_gruppename: null, lebtab_source: null,
  lebtab_source_code: null, lebtab_source_detail: null, lebtab_probiotisch: null,
};
const INGREDIENTS = [{ LM_Zutat: 'a1a100', Menge: 60 }, { LM_Zutat: 'JVB100', Menge: 0.5 }];
const NUTRITION = Object.fromEntries(NUTRITION_COLUMNS.map((c, i) => [c, i]));

let conn;
let calls;
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  const track = (name) => vi.fn(async () => { calls.push(name); });
  conn = { beginTransaction: track('begin'), commit: track('commit'), rollback: track('rollback'), release: vi.fn(() => calls.push('release')) };
  pool.getConnection.mockResolvedValue(conn);
  getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: false });
  lebtabModel.findStoredLmc.mockImplementation(async () => { calls.push('stored'); return null; });
  lebtabModel.findStoredLmcs.mockImplementation(async () => { calls.push('refs'); return ['A1A100', 'JVB100']; });
  nutritionService.calculateNutrition.mockImplementation(async () => { calls.push('calc'); return { nutrition: NUTRITION, warnings: [], contributingRows: 2 }; });
  lebtabModel.insert.mockImplementation(async () => { calls.push('insert lebtab'); });
  czutabModel.insertMany.mockImplementation(async () => { calls.push('insert c_zutab'); return 2; });
});

describe('productService.createProduct', () => {
  it('runs ONE transaction in the right order and returns { lmc, nutrition, _row_version: 1, warnings }', async () => {
    const res = await createProduct({ product: PRODUCT, ingredients: INGREDIENTS });
    expect(calls).toEqual(['begin', 'stored', 'refs', 'calc', 'insert lebtab', 'insert c_zutab', 'commit', 'release']);
    expect(res).toEqual({ lmc: 'ZZT001', nutrition: NUTRITION, _row_version: 1, warnings: [] });
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('passes the transaction connection (never the pool) to every model call and to calculateNutrition', async () => {
    await createProduct({ product: PRODUCT, ingredients: INGREDIENTS });
    expect(lebtabModel.findStoredLmc).toHaveBeenCalledWith('ZZT001', conn);
    expect(lebtabModel.findStoredLmcs).toHaveBeenCalledWith(['a1a100', 'JVB100'], conn);
    expect(nutritionService.calculateNutrition.mock.calls[0][1]).toBe(conn);
    expect(lebtabModel.insert.mock.calls[0][1]).toBe(conn);
    expect(czutabModel.insertMany.mock.calls[0][1]).toBe(conn);
  });

  it('calculates with the DB spelling of each code and inserts 92 columns: 13 product + 79 nutrition, no technical columns', async () => {
    await createProduct({ product: PRODUCT, ingredients: INGREDIENTS });
    expect(nutritionService.calculateNutrition.mock.calls[0][0]).toEqual([
      { LM_Zutat: 'A1A100', Menge: 60 }, { LM_Zutat: 'JVB100', Menge: 0.5 },
    ]);
    const row = lebtabModel.insert.mock.calls[0][0];
    expect(Object.keys(row)).toHaveLength(92);
    expect(row).toMatchObject({ ...PRODUCT, ...NUTRITION });
    expect(row).not.toHaveProperty('_row_version');
    expect(row).not.toHaveProperty('lebtab_nutrition_stale');
    expect(row).not.toHaveProperty('lebtab_bemerkung');
  });

  it('writes c_zutab rows in payload order with LMC, DB spelling of LM_Zutat, Version 0 and Anrcode 0', async () => {
    await createProduct({ product: PRODUCT, ingredients: INGREDIENTS });
    expect(czutabModel.insertMany.mock.calls[0][0]).toEqual([
      { LMC: 'ZZT001', LM_Zutat: 'A1A100', Menge: 60, Version: 0, Anrcode: 0 },
      { LMC: 'ZZT001', LM_Zutat: 'JVB100', Menge: 0.5, Version: 0, Anrcode: 0 },
    ]);
  });

  it('calls calculateNutrition and NEVER recalculateNutrition (ARCH 8.3 #5)', async () => {
    await createProduct({ product: PRODUCT, ingredients: INGREDIENTS });
    expect(nutritionService.calculateNutrition).toHaveBeenCalledTimes(1);
    expect(nutritionService.recalculateNutrition).not.toHaveBeenCalled();
  });

  it('without ingredients: no reference lookup, calculateNutrition([]) -> stored as returned (79 null), no c_zutab insert', async () => {
    const nulls = Object.fromEntries(NUTRITION_COLUMNS.map((c) => [c, null]));
    nutritionService.calculateNutrition.mockResolvedValue({ nutrition: nulls, warnings: [], contributingRows: 0 });
    const res = await createProduct({ product: PRODUCT, ingredients: [] });
    expect(lebtabModel.findStoredLmcs).not.toHaveBeenCalled();
    expect(nutritionService.calculateNutrition).toHaveBeenCalledWith([], conn);
    expect(lebtabModel.insert.mock.calls[0][0].lebtab_E_CAL).toBeNull();
    expect(czutabModel.insertMany).toHaveBeenCalledWith([], conn);
    expect(res.nutrition).toEqual(nulls);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('returns the warnings of calculateNutrition (e.g. A_MARKER_EMPTY) and still commits', async () => {
    const warnings = [{ reason: 'A_MARKER_EMPTY', LM_Zutat: 'JJJJ00' }];
    nutritionService.calculateNutrition.mockResolvedValue({ nutrition: NUTRITION, warnings, contributingRows: 1 });
    const res = await createProduct({ product: PRODUCT, ingredients: INGREDIENTS });
    expect(res.warnings).toEqual(warnings);
    expect(conn.commit).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Produkt angelegt', { lmc: 'ZZT001', zutaten: 2, warnings: 1 });
  });

  it('503 MIGRATION_REQUIRED before touching the pool when 001 has not run', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    await expect(createProduct({ product: PRODUCT, ingredients: [] })).rejects.toMatchObject({
      status: 503, code: 'MIGRATION_REQUIRED', message: 'Datenbank-Migration 001 wurde noch nicht ausgeführt',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('409 LMC_ALREADY_EXISTS from the pre-check: rollback, release, nothing inserted', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue('ZZT001');
    await expect(createProduct({ product: PRODUCT, ingredients: INGREDIENTS })).rejects.toMatchObject({
      status: 409, code: 'LMC_ALREADY_EXISTS', message: 'Die Produktnummer existiert bereits',
    });
    expect(calls).toEqual(['begin', 'rollback', 'release']);
    expect(lebtabModel.insert).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('409 LMC_ALREADY_EXISTS when the PRIMARY KEY rejects the INSERT (race between two users)', async () => {
    const dup = new Error("Duplicate entry 'ZZT001' for key 'PRIMARY'");
    dup.code = 'ER_DUP_ENTRY';
    lebtabModel.insert.mockRejectedValue(dup);
    await expect(createProduct({ product: PRODUCT, ingredients: INGREDIENTS })).rejects.toMatchObject({
      status: 409, code: 'LMC_ALREADY_EXISTS',
    });
    expect(conn.rollback).toHaveBeenCalled();
    expect(czutabModel.insertMany).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('400 INGREDIENT_NOT_FOUND with details for every unknown code; rollback before any INSERT', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue(['JVB100']);
    const input = { product: PRODUCT, ingredients: [{ LM_Zutat: 'X00001', Menge: 1 }, { LM_Zutat: 'JVB100', Menge: 1 }, { LM_Zutat: 'X00002', Menge: 1 }] };
    await expect(createProduct(input)).rejects.toMatchObject({
      status: 400, code: 'INGREDIENT_NOT_FOUND', message: 'Zutat X00001 existiert nicht',
      details: [
        { field: 'ingredients[0].LM_Zutat', issue: 'Zutat X00001 existiert nicht' },
        { field: 'ingredients[2].LM_Zutat', issue: 'Zutat X00002 existiert nicht' },
      ],
    });
    expect(nutritionService.calculateNutrition).not.toHaveBeenCalled();
    expect(lebtabModel.insert).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('rolls back and rethrows an unexpected DB error from the c_zutab insert (no half-created product)', async () => {
    const boom = new Error('lost');
    boom.code = 'PROTOCOL_CONNECTION_LOST';
    czutabModel.insertMany.mockRejectedValue(boom);
    await expect(createProduct({ product: PRODUCT, ingredients: INGREDIENTS })).rejects.toBe(boom);
    expect(calls).toEqual(['begin', 'stored', 'refs', 'calc', 'insert lebtab', 'rollback', 'release']);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('keeps the original error when rollback itself fails (connection gone) and still releases', async () => {
    const boom = new Error('boom');
    lebtabModel.insert.mockRejectedValue(boom);
    conn.rollback.mockRejectedValue(new Error('rollback failed'));
    await expect(createProduct({ product: PRODUCT, ingredients: INGREDIENTS })).rejects.toBe(boom);
    expect(conn.release).toHaveBeenCalled();
  });
});
