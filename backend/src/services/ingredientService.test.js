import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../config/db.js', () => ({ pool: { getConnection: vi.fn() } }));
vi.mock('../config/schemaInfo.js', () => ({ getSchemaInfo: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../models/lebtabModel.js', () => ({
  findStoredLmc: vi.fn(),
  findStoredLmcs: vi.fn(),
  setNutritionStale: vi.fn(),
}));
vi.mock('../models/czutabModel.js', () => ({
  findByIdWithZutat: vi.fn(),
  findByIdForUpdate: vi.fn(),
  findByLmcAndZutat: vi.fn(),
  countByLmc: vi.fn(),
  insert: vi.fn(),
  updateMenge: vi.fn(),
  deleteById: vi.fn(),
}));
vi.mock('../models/archiveModel.js', () => ({ insertIngredientArchive: vi.fn() }));

import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import { logger } from '../utils/logger.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import * as archiveModel from '../models/archiveModel.js';
import { INGREDIENT_MAX_PER_PRODUCT } from '../utils/limits.js';
import {
  validateIngredientRefs,
  resolveIngredientRef,
  addIngredient,
  updateIngredient,
  deleteIngredient,
  NEW_ROW_VERSION,
  NEW_ROW_ANRCODE,
} from './ingredientService.js';

const CONN = { tag: 'conn' };
const DB_ROW = { id: 540974, LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25, Version: 3, Anrcode: 0 };
const JOINED = { ...DB_ROW, zutat: { lebtab_Bezeich: 'Joghurt', lebtab_Itemart: 'L' } };

let conn;
let calls;
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  const track = (name) => vi.fn(async () => { calls.push(name); });
  conn = { beginTransaction: track('begin'), commit: track('commit'), rollback: track('rollback'), release: vi.fn(() => calls.push('release')) };
  pool.getConnection.mockResolvedValue(conn);
  getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: true });
  lebtabModel.findStoredLmc.mockImplementation(async () => { calls.push('product'); return 'A1CK00'; });
  lebtabModel.findStoredLmcs.mockImplementation(async () => { calls.push('refs'); return ['AFB000']; });
  lebtabModel.setNutritionStale.mockImplementation(async () => { calls.push('stale'); return 1; });
  czutabModel.countByLmc.mockImplementation(async () => { calls.push('count'); return 18; });
  czutabModel.findByLmcAndZutat.mockImplementation(async () => { calls.push('dup'); return []; });
  czutabModel.insert.mockImplementation(async () => { calls.push('insert'); return 540974; });
  czutabModel.findByIdWithZutat.mockImplementation(async () => { calls.push('read'); return JOINED; });
  czutabModel.findByIdForUpdate.mockImplementation(async () => { calls.push('lock'); return DB_ROW; });
  czutabModel.updateMenge.mockImplementation(async () => { calls.push('update'); return 1; });
  czutabModel.deleteById.mockImplementation(async () => { calls.push('delete'); return 1; });
  archiveModel.insertIngredientArchive.mockImplementation(async () => { calls.push('archive'); });
});

describe('ingredientService.validateIngredientRefs', () => {
  it('resolves every code with ONE query and returns rows with the DB spelling (collation _ci)', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue(['A1A100', 'JVB100']);
    const rows = await validateIngredientRefs([{ LM_Zutat: 'a1a100', Menge: 10 }, { LM_Zutat: 'JVB100', Menge: 0 }], CONN);
    expect(lebtabModel.findStoredLmcs).toHaveBeenCalledTimes(1);
    expect(lebtabModel.findStoredLmcs).toHaveBeenCalledWith(['a1a100', 'JVB100'], CONN);
    expect(rows).toEqual([{ LM_Zutat: 'A1A100', Menge: 10 }, { LM_Zutat: 'JVB100', Menge: 0 }]);
  });

  it('a row with Menge 0 must exist too; the first missing code is the message', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue(['JVB100']);
    await expect(validateIngredientRefs([{ LM_Zutat: 'X00000', Menge: 0 }, { LM_Zutat: 'JVB100', Menge: 1 }], CONN)).rejects.toMatchObject({
      status: 400, code: 'INGREDIENT_NOT_FOUND', message: 'Zutat X00000 existiert nicht',
      details: [{ field: 'ingredients[0].LM_Zutat', issue: 'Zutat X00000 existiert nicht' }],
    });
  });

  it('lists every missing code in details (not only the first)', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue([]);
    await expect(validateIngredientRefs([{ LM_Zutat: 'X00001', Menge: 1 }, { LM_Zutat: 'X00002', Menge: 1 }], CONN)).rejects.toMatchObject({
      details: [
        { field: 'ingredients[0].LM_Zutat', issue: 'Zutat X00001 existiert nicht' },
        { field: 'ingredients[1].LM_Zutat', issue: 'Zutat X00002 existiert nicht' },
      ],
    });
  });

  it('empty list -> [] without a query', async () => {
    expect(await validateIngredientRefs([], CONN)).toEqual([]);
    expect(lebtabModel.findStoredLmcs).not.toHaveBeenCalled();
  });

  it('new rows get Version 0 and Anrcode 0 (DECISIONS #42, #90)', () => {
    expect(NEW_ROW_VERSION).toBe(0);
    expect(NEW_ROW_ANRCODE).toBe(0);
  });

  it('never imports nutritionService (SPEC 5.2, ARCH 8.3 #6)', () => {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ingredientService.js');
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/import[^;]*nutritionService/);
  });
});

describe('ingredientService.resolveIngredientRef (#7)', () => {
  it('returns the DB spelling; unknown code -> 400 INGREDIENT_NOT_FOUND with field LM_Zutat', async () => {
    expect(await resolveIngredientRef('afb000', CONN)).toBe('AFB000');
    expect(lebtabModel.findStoredLmcs).toHaveBeenCalledWith(['afb000'], CONN);
    lebtabModel.findStoredLmcs.mockResolvedValue([]);
    await expect(resolveIngredientRef('X00000', CONN)).rejects.toMatchObject({
      status: 400, code: 'INGREDIENT_NOT_FOUND', message: 'Zutat X00000 existiert nicht',
      details: [{ field: 'LM_Zutat', issue: 'Zutat X00000 existiert nicht' }],
    });
  });
});

describe('ingredientService.addIngredient (#7)', () => {
  const input = { LM_Zutat: 'afb000', Menge: 25, confirmDuplicate: false };

  it('one transaction in order: product -> count -> ref -> duplicate check -> INSERT -> stale -> read; returns IngredientRow + stale 1', async () => {
    const res = await addIngredient('a1ck00', input);
    expect(calls).toEqual(['begin', 'product', 'count', 'refs', 'dup', 'insert', 'stale', 'read', 'commit', 'release']);
    expect(res).toEqual({ ...JOINED, lebtab_nutrition_stale: 1 });
    expect(czutabModel.insert).toHaveBeenCalledWith(
      { LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25, Version: 0, Anrcode: 0 }, conn,
    );
    expect(lebtabModel.setNutritionStale).toHaveBeenCalledWith('A1CK00', conn);
    expect(czutabModel.findByLmcAndZutat).toHaveBeenCalledWith('A1CK00', 'AFB000', conn);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Zutat hinzugefügt', { lmc: 'A1CK00', id: 540974, LM_Zutat: 'AFB000', duplicate: false });
  });

  it('passes the transaction connection (never the pool) to every model call', async () => {
    await addIngredient('A1CK00', input);
    for (const fn of [lebtabModel.findStoredLmc, czutabModel.countByLmc, lebtabModel.findStoredLmcs, czutabModel.findByLmcAndZutat, czutabModel.insert, lebtabModel.setNutritionStale, czutabModel.findByIdWithZutat]) {
      expect(fn.mock.calls[0].at(-1)).toBe(conn);
    }
  });

  it('pair already present and no confirmDuplicate -> 200 warning with ALL existing rows, nothing inserted (SPEC 5.3)', async () => {
    czutabModel.findByLmcAndZutat.mockResolvedValue([{ id: 1, Menge: 25 }, { id: 9, Menge: 30 }]);
    const res = await addIngredient('A1CK00', input);
    expect(res).toEqual({ warning: 'DUPLICATE_INGREDIENT', existing: [{ id: 1, Menge: 25 }, { id: 9, Menge: 30 }], needConfirm: true });
    expect(czutabModel.insert).not.toHaveBeenCalled();
    expect(lebtabModel.setNutritionStale).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('confirmDuplicate: true -> inserts a NEW row (no merge, no overwrite)', async () => {
    czutabModel.findByLmcAndZutat.mockResolvedValue([{ id: 1, Menge: 25 }]);
    const res = await addIngredient('A1CK00', { ...input, confirmDuplicate: true });
    expect(res.id).toBe(540974);
    expect(czutabModel.insert).toHaveBeenCalledTimes(1);
    expect(czutabModel.updateMenge).not.toHaveBeenCalled();
    expect(logger.info.mock.calls[0][1].duplicate).toBe(true);
  });

  it('503 MIGRATION_REQUIRED (001) before touching the pool', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    await expect(addIngredient('A1CK00', input)).rejects.toMatchObject({
      status: 503, code: 'MIGRATION_REQUIRED', message: 'Datenbank-Migration 001 wurde noch nicht ausgeführt',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('404 for a malformed lmc without touching the pool, and for an unknown product (rollback, release)', async () => {
    await expect(addIngredient('abc', input)).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    expect(pool.getConnection).not.toHaveBeenCalled();
    lebtabModel.findStoredLmc.mockResolvedValue(null);
    await expect(addIngredient('ZZZZZZ', input)).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    expect(calls).toEqual(['begin', 'rollback', 'release']);
    expect(czutabModel.insert).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR for a self-reference (case-insensitive) — before any lookup', async () => {
    await expect(addIngredient('A1CK00', { ...input, LM_Zutat: 'a1ck00' })).rejects.toMatchObject({
      status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'LM_Zutat', issue: 'ein Produkt kann nicht seine eigene Zutat sein' }],
    });
    expect(lebtabModel.findStoredLmcs).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
  });

  it(`400 when the product already has ${INGREDIENT_MAX_PER_PRODUCT} rows`, async () => {
    czutabModel.countByLmc.mockResolvedValue(INGREDIENT_MAX_PER_PRODUCT);
    await expect(addIngredient('A1CK00', input)).rejects.toMatchObject({
      status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'LM_Zutat', issue: `höchstens ${INGREDIENT_MAX_PER_PRODUCT} Zutaten je Produkt` }],
    });
    expect(czutabModel.insert).not.toHaveBeenCalled();
  });

  it('400 INGREDIENT_NOT_FOUND when the code does not exist; nothing inserted, rollback', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue([]);
    await expect(addIngredient('A1CK00', { ...input, LM_Zutat: 'X00000' })).rejects.toMatchObject({
      status: 400, code: 'INGREDIENT_NOT_FOUND', details: [{ field: 'LM_Zutat', issue: 'Zutat X00000 existiert nicht' }],
    });
    expect(czutabModel.findByLmcAndZutat).not.toHaveBeenCalled();
    expect(czutabModel.insert).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('product deleted meanwhile (stale update hits 0 rows) -> 404 and rollback of the INSERT', async () => {
    lebtabModel.setNutritionStale.mockResolvedValue(0);
    await expect(addIngredient('A1CK00', input)).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows a DB error; keeps the original error when rollback fails; always releases', async () => {
    const boom = new Error('lost');
    boom.code = 'PROTOCOL_CONNECTION_LOST';
    czutabModel.insert.mockRejectedValue(boom);
    conn.rollback.mockRejectedValue(new Error('rollback failed'));
    await expect(addIngredient('A1CK00', input)).rejects.toBe(boom);
    expect(conn.release).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

describe('ingredientService.updateIngredient (#8)', () => {
  it('locks the row, checks ownership, updates ONLY Menge, sets stale, returns the re-read IngredientRow + stale 1', async () => {
    czutabModel.findByIdWithZutat.mockImplementation(async () => { calls.push('read'); return { ...JOINED, Menge: 40 }; });
    const res = await updateIngredient('a1ck00', '540974', { Menge: 40 });
    expect(calls).toEqual(['begin', 'product', 'lock', 'update', 'stale', 'read', 'commit', 'release']);
    expect(czutabModel.findByIdForUpdate).toHaveBeenCalledWith(540974, conn);
    expect(czutabModel.updateMenge).toHaveBeenCalledWith(540974, 40, conn);
    expect(res).toEqual({ ...JOINED, Menge: 40, lebtab_nutrition_stale: 1 });
    expect(res.Version).toBe(3); // unveraendert (SPEC 5.7)
  });

  it('404 when the row belongs to another product (guessed id) — nothing updated', async () => {
    czutabModel.findByIdForUpdate.mockResolvedValue({ ...DB_ROW, LMC: 'B00000' });
    await expect(updateIngredient('A1CK00', '540974', { Menge: 1 })).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    expect(czutabModel.updateMenge).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('404 when the row does not exist, and for a malformed id without touching the pool', async () => {
    czutabModel.findByIdForUpdate.mockResolvedValue(null);
    await expect(updateIngredient('A1CK00', '1', { Menge: 1 })).rejects.toMatchObject({ status: 404 });
    vi.clearAllMocks();
    for (const bad of ['0', 'abc', '1.5', '-1', '99999999999']) {
      await expect(updateIngredient('A1CK00', bad, { Menge: 1 })).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    }
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('503 MIGRATION_REQUIRED (001) before the pool', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    await expect(updateIngredient('A1CK00', '1', { Menge: 1 })).rejects.toMatchObject({ status: 503, code: 'MIGRATION_REQUIRED' });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});

describe('ingredientService.deleteIngredient (#9)', () => {
  it('one transaction: lock -> copy to c_zutab_archive (lebtab_archive_id NULL) -> DELETE -> stale; returns { deleted, id, stale }', async () => {
    const res = await deleteIngredient('A1CK00', '540974');
    expect(calls).toEqual(['begin', 'product', 'lock', 'archive', 'delete', 'stale', 'commit', 'release']);
    expect(archiveModel.insertIngredientArchive).toHaveBeenCalledWith(DB_ROW, null, conn);
    expect(czutabModel.deleteById).toHaveBeenCalledWith(540974, conn);
    expect(lebtabModel.setNutritionStale).toHaveBeenCalledWith('A1CK00', conn);
    expect(res).toEqual({ deleted: true, id: 540974, lebtab_nutrition_stale: 1 });
    expect(logger.info).toHaveBeenCalledWith('Zutat archiviert', { lmc: 'A1CK00', id: 540974, LM_Zutat: 'AFB000' });
  });

  it('DELETE only after the archive copy succeeded: archive error -> rollback, no DELETE', async () => {
    archiveModel.insertIngredientArchive.mockRejectedValue(new Error('archive failed'));
    await expect(deleteIngredient('A1CK00', '540974')).rejects.toThrow('archive failed');
    expect(czutabModel.deleteById).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('503 MIGRATION_REQUIRED 002 when the archive tables are missing (001 present), 001 when both are missing', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: false });
    await expect(deleteIngredient('A1CK00', '540974')).rejects.toMatchObject({
      status: 503, code: 'MIGRATION_REQUIRED', message: 'Datenbank-Migration 002 wurde noch nicht ausgeführt',
    });
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    await expect(deleteIngredient('A1CK00', '540974')).rejects.toMatchObject({
      message: 'Datenbank-Migration 001 wurde noch nicht ausgeführt',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('404 for a foreign row, a missing row and a malformed id — nothing archived or deleted', async () => {
    czutabModel.findByIdForUpdate.mockResolvedValue({ ...DB_ROW, LMC: 'B00000' });
    await expect(deleteIngredient('A1CK00', '540974')).rejects.toMatchObject({ status: 404 });
    czutabModel.findByIdForUpdate.mockResolvedValue(null);
    await expect(deleteIngredient('A1CK00', '540974')).rejects.toMatchObject({ status: 404 });
    await expect(deleteIngredient('A1CK00', 'x')).rejects.toMatchObject({ status: 404 });
    expect(archiveModel.insertIngredientArchive).not.toHaveBeenCalled();
    expect(czutabModel.deleteById).not.toHaveBeenCalled();
  });
});
