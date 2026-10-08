import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Laeuft OHNE Datenbank (ARCH 8.3 #9: Tests mit Schreibzugriff nur mit Model-Mock): Pool + Models + schemaInfo gemockt.
vi.mock('../config/db.js', () => ({ pool: { getConnection: vi.fn(), query: vi.fn() } }));
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
import { createApp } from '../app.js';

const app = createApp();
const BASE = '/api/products/A1CK00/ingredients';
const DB_ROW = { id: 540974, LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25, Version: 0, Anrcode: 0 };
const JOINED = { ...DB_ROW, zutat: { lebtab_Bezeich: 'Joghurt', lebtab_Itemart: 'L' } };

let conn;
beforeEach(() => {
  vi.clearAllMocks();
  conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
  getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: true });
  lebtabModel.findStoredLmc.mockResolvedValue('A1CK00');
  lebtabModel.findStoredLmcs.mockResolvedValue(['AFB000']);
  lebtabModel.setNutritionStale.mockResolvedValue(1);
  czutabModel.countByLmc.mockResolvedValue(18);
  czutabModel.findByLmcAndZutat.mockResolvedValue([]);
  czutabModel.insert.mockResolvedValue(540974);
  czutabModel.findByIdWithZutat.mockResolvedValue(JOINED);
  czutabModel.findByIdForUpdate.mockResolvedValue(DB_ROW);
  czutabModel.updateMenge.mockResolvedValue(1);
  czutabModel.deleteById.mockResolvedValue(1);
  archiveModel.insertIngredientArchive.mockResolvedValue(undefined);
});

describe('POST /api/products/:lmc/ingredients (#7)', () => {
  it('200 { ...IngredientRow, lebtab_nutrition_stale: 1 } — inserted with Version 0 / Anrcode 0, stale set, committed', async () => {
    const res = await request(app).post(BASE).send({ LM_Zutat: 'afb000', Menge: 25 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...JOINED, lebtab_nutrition_stale: 1 });
    expect(czutabModel.insert).toHaveBeenCalledWith({ LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25, Version: 0, Anrcode: 0 }, conn);
    expect(lebtabModel.setNutritionStale).toHaveBeenCalledWith('A1CK00', conn);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('200 { warning: DUPLICATE_INGREDIENT, existing[], needConfirm: true } when the pair exists — no INSERT, no stale', async () => {
    czutabModel.findByLmcAndZutat.mockResolvedValue([{ id: 1, Menge: 25 }]);
    const res = await request(app).post(BASE).send({ LM_Zutat: 'AFB000', Menge: 30 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ warning: 'DUPLICATE_INGREDIENT', existing: [{ id: 1, Menge: 25 }], needConfirm: true });
    expect(czutabModel.insert).not.toHaveBeenCalled();
    expect(lebtabModel.setNutritionStale).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('confirmDuplicate: true -> 200 with the new row', async () => {
    czutabModel.findByLmcAndZutat.mockResolvedValue([{ id: 1, Menge: 25 }]);
    const res = await request(app).post(BASE).send({ LM_Zutat: 'AFB000', Menge: 30, confirmDuplicate: true });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(540974);
    expect(czutabModel.insert).toHaveBeenCalledTimes(1);
  });

  it('400 VALIDATION_ERROR with details BEFORE schemaInfo/pool: missing Menge, negative Menge (DECISIONS #87), bad code', async () => {
    const res = await request(app).post(BASE).send({ LM_Zutat: 'AB', Menge: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR', message: 'Ungültige Eingabedaten', status: 400,
      details: [
        { field: 'LM_Zutat', issue: 'muss genau 6 Zeichen (A–Z, 0–9) haben' },
        { field: 'Menge', issue: 'muss 0 oder größer sein' },
      ],
    });
    expect(getSchemaInfo).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
    const missing = await request(app).post(BASE).send({ LM_Zutat: 'AFB000' });
    expect(missing.body.error.details).toEqual([{ field: 'Menge', issue: 'darf nicht leer sein' }]);
  });

  it('400 for a self-reference and 400 INGREDIENT_NOT_FOUND for an unknown code', async () => {
    const self = await request(app).post(BASE).send({ LM_Zutat: 'a1ck00', Menge: 1 });
    expect(self.status).toBe(400);
    expect(self.body.error.details).toEqual([{ field: 'LM_Zutat', issue: 'ein Produkt kann nicht seine eigene Zutat sein' }]);
    lebtabModel.findStoredLmcs.mockResolvedValue([]);
    const unknown = await request(app).post(BASE).send({ LM_Zutat: 'X00000', Menge: 1 });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toEqual({
      code: 'INGREDIENT_NOT_FOUND', message: 'Zutat X00000 existiert nicht', status: 400,
      details: [{ field: 'LM_Zutat', issue: 'Zutat X00000 existiert nicht' }],
    });
    expect(czutabModel.insert).not.toHaveBeenCalled();
  });

  it('404 PRODUCT_NOT_FOUND for an unknown product and for a malformed lmc (no DB)', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue(null);
    const res = await request(app).post(BASE).send({ LM_Zutat: 'AFB000', Menge: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'PRODUCT_NOT_FOUND', message: 'Produkt nicht gefunden', status: 404 });
    vi.clearAllMocks();
    const bad = await request(app).post('/api/products/abc/ingredients').send({ LM_Zutat: 'AFB000', Menge: 1 });
    expect(bad.status).toBe(404);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('503 MIGRATION_REQUIRED without migration 001; 503 DB_UNAVAILABLE when the pool is down', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    const res = await request(app).post(BASE).send({ LM_Zutat: 'AFB000', Menge: 1 });
    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({ code: 'MIGRATION_REQUIRED', message: 'Datenbank-Migration 001 wurde noch nicht ausgeführt', status: 503 });
    getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: true });
    const down = new Error('connect ECONNREFUSED');
    down.code = 'ECONNREFUSED';
    pool.getConnection.mockRejectedValue(down);
    const res2 = await request(app).post(BASE).send({ LM_Zutat: 'AFB000', Menge: 1 });
    expect(res2.status).toBe(503);
    expect(res2.body.error.code).toBe('DB_UNAVAILABLE');
  });

  it('broken JSON -> 400 VALIDATION_ERROR (body-parser, DECISIONS #89)', async () => {
    const res = await request(app).post(BASE).set('Content-Type', 'application/json').send('{"Menge": ');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Ungültiges JSON im Request-Body');
  });
});

describe('PUT /api/products/:lmc/ingredients/:id (#8)', () => {
  it('200 { ...IngredientRow, lebtab_nutrition_stale: 1 }; only Menge is updated', async () => {
    czutabModel.findByIdWithZutat.mockResolvedValue({ ...JOINED, Menge: 40 });
    const res = await request(app).put(`${BASE}/540974`).send({ Menge: 40, LM_Zutat: 'HACK00' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...JOINED, Menge: 40, lebtab_nutrition_stale: 1 });
    expect(czutabModel.updateMenge).toHaveBeenCalledWith(540974, 40, conn);
    expect(czutabModel.insert).not.toHaveBeenCalled();
  });

  it('400 for a missing/negative Menge, before the DB', async () => {
    const res = await request(app).put(`${BASE}/540974`).send({ Menge: -3 });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'Menge', issue: 'muss 0 oder größer sein' }]);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('404 when the row belongs to another product, does not exist, or the id is malformed', async () => {
    czutabModel.findByIdForUpdate.mockResolvedValue({ ...DB_ROW, LMC: 'B00000' });
    expect((await request(app).put(`${BASE}/540974`).send({ Menge: 1 })).status).toBe(404);
    czutabModel.findByIdForUpdate.mockResolvedValue(null);
    expect((await request(app).put(`${BASE}/540974`).send({ Menge: 1 })).status).toBe(404);
    expect((await request(app).put(`${BASE}/abc`).send({ Menge: 1 })).status).toBe(404);
    expect(czutabModel.updateMenge).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/products/:lmc/ingredients/:id (#9)', () => {
  it('200 { deleted: true, id, lebtab_nutrition_stale: 1 } — archived first, then deleted, then stale', async () => {
    const res = await request(app).delete(`${BASE}/540974`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, id: 540974, lebtab_nutrition_stale: 1 });
    expect(archiveModel.insertIngredientArchive).toHaveBeenCalledWith(DB_ROW, null, conn);
    expect(czutabModel.deleteById).toHaveBeenCalledWith(540974, conn);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('503 MIGRATION_REQUIRED 002 when archive tables are missing', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: false });
    const res = await request(app).delete(`${BASE}/540974`);
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Datenbank-Migration 002 wurde noch nicht ausgeführt');
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('404 for a foreign or missing row — nothing archived', async () => {
    czutabModel.findByIdForUpdate.mockResolvedValue(null);
    expect((await request(app).delete(`${BASE}/540974`)).status).toBe(404);
    expect(archiveModel.insertIngredientArchive).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
  });
});
