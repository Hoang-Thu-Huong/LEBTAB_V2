import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Laeuft OHNE Datenbank (ARCH 8.3 #9: Tests mit Schreibzugriff nur mit Model-Mock): Pool + Models + schemaInfo gemockt.
vi.mock('../config/db.js', () => ({ pool: { getConnection: vi.fn(), query: vi.fn() } }));
vi.mock('../config/schemaInfo.js', () => ({ getSchemaInfo: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../models/lebtabModel.js', () => ({
  findPage: vi.fn(),
  count: vi.fn(),
  findByLmc: vi.fn(),
  findStoredLmc: vi.fn(),
  findStoredLmcs: vi.fn(),
  findNutritionByLmcs: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('../models/czutabModel.js', () => ({ findByLmcWithZutat: vi.fn(), insertMany: vi.fn() }));

import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import { logger } from '../utils/logger.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { createApp } from '../app.js';

const app = createApp();
const post = (body) => request(app).post('/api/products').send(body);

/** lebtab-Zeile einer Zutat fuer calculateNutrition: alle 79 Werte = value. */
function reference(lmc, itemart, value) {
  const row = { lebtab_lmc: lmc, lebtab_Itemart: itemart };
  for (const c of NUTRITION_COLUMNS) row[c] = value;
  return row;
}
const BODY = {
  lebtab_lmc: 'ZZT001', lebtab_Bezeich: 'Testprodukt', lebtab_Itemart: 'V', lebtab_Datum: '2026-10-06',
  ingredients: [{ LM_Zutat: 'A1A100', Menge: 50 }, { LM_Zutat: 'JVB100', Menge: 2 }],
};

let conn;
beforeEach(() => {
  vi.clearAllMocks();
  conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
  getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: false });
  lebtabModel.findStoredLmc.mockResolvedValue(null);
  lebtabModel.findStoredLmcs.mockResolvedValue(['A1A100', 'JVB100']);
  lebtabModel.findNutritionByLmcs.mockResolvedValue([reference('A1A100', 'L', 10), reference('JVB100', 'L', 0)]);
  lebtabModel.insert.mockResolvedValue(undefined);
  czutabModel.insertMany.mockResolvedValue(2);
});

describe('POST /api/products (#3)', () => {
  it('201 { lmc, nutrition{79}, _row_version: 1, warnings: [] } — nutrition = Σ(Menge × Wert) / 100', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ lmc: 'ZZT001', _row_version: 1, warnings: [] });
    expect(Object.keys(res.body.nutrition)).toEqual([...NUTRITION_COLUMNS]);
    expect(res.body.nutrition.lebtab_E_CAL).toBe(5); // (50 × 10 + 2 × 0) / 100
    expect(conn.commit).toHaveBeenCalled();
    expect(lebtabModel.insert.mock.calls[0][0]).toMatchObject({ lebtab_lmc: 'ZZT001', lebtab_aktuell: 1, lebtab_E_CAL: 5 });
    expect(czutabModel.insertMany.mock.calls[0][0]).toEqual([
      { LMC: 'ZZT001', LM_Zutat: 'A1A100', Menge: 50, Version: 0, Anrcode: 0 },
      { LMC: 'ZZT001', LM_Zutat: 'JVB100', Menge: 2, Version: 0, Anrcode: 0 },
    ]);
  });

  it('201 without ingredients: 79 × null, no c_zutab rows', async () => {
    const res = await post({ ...BODY, ingredients: [] });
    expect(res.status).toBe(201);
    expect(Object.values(res.body.nutrition).every((v) => v === null)).toBe(true);
    expect(czutabModel.insertMany).toHaveBeenCalledWith([], conn);
  });

  it('nutrition columns in the body are ignored, not written (SPEC 6.4)', async () => {
    const res = await post({ ...BODY, ingredients: [], lebtab_E_CAL: 999 });
    expect(res.status).toBe(201);
    expect(lebtabModel.insert.mock.calls[0][0].lebtab_E_CAL).toBeNull();
  });

  it('400 VALIDATION_ERROR with details[] BEFORE schemaInfo/pool are touched', async () => {
    const res = await post({ lebtab_lmc: 'bad', lebtab_Bezeich: '', lebtab_Itemart: 'X', lebtab_Datum: '2020-02-30', ingredients: [{ LM_Zutat: 'A1A100', Menge: -1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Ungültige Eingabedaten', status: 400 });
    expect(res.body.error.details.map((d) => d.field)).toEqual([
      'lebtab_lmc', 'lebtab_Itemart', 'lebtab_Datum', 'lebtab_Bezeich', 'ingredients[0].Menge',
    ]);
    expect(getSchemaInfo).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('400 for a duplicate ingredient and for a self-reference (hard block, no confirmDuplicate)', async () => {
    const dup = await post({ ...BODY, ingredients: [{ LM_Zutat: 'A1A100', Menge: 1 }, { LM_Zutat: 'a1a100', Menge: 2 }] });
    expect(dup.status).toBe(400);
    expect(dup.body.error.details).toEqual([{ field: 'ingredients[1].LM_Zutat', issue: 'Zutat doppelt (bereits in Zeile 1)' }]);
    const self = await post({ ...BODY, ingredients: [{ LM_Zutat: 'zzt001', Menge: 1 }] });
    expect(self.status).toBe(400);
    expect(self.body.error.details[0].field).toBe('ingredients[0].LM_Zutat');
  });

  it('400 INGREDIENT_NOT_FOUND when a code does not exist in lebtab; nothing inserted', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue(['A1A100']);
    const res = await post(BODY);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INGREDIENT_NOT_FOUND', message: 'Zutat JVB100 existiert nicht', status: 400,
      details: [{ field: 'ingredients[1].LM_Zutat', issue: 'Zutat JVB100 existiert nicht' }],
    });
    expect(lebtabModel.insert).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('409 LMC_ALREADY_EXISTS (pre-check) and 409 on ER_DUP_ENTRY (race)', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue('ZZT001');
    const pre = await post(BODY);
    expect(pre.status).toBe(409);
    expect(pre.body.error).toEqual({ code: 'LMC_ALREADY_EXISTS', message: 'Die Produktnummer existiert bereits', status: 409 });

    lebtabModel.findStoredLmc.mockResolvedValue(null);
    const dup = new Error('Duplicate entry');
    dup.code = 'ER_DUP_ENTRY';
    lebtabModel.insert.mockRejectedValue(dup);
    const race = await post(BODY);
    expect(race.status).toBe(409);
    expect(race.body.error.code).toBe('LMC_ALREADY_EXISTS');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('503 MIGRATION_REQUIRED when migration 001 has not run', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
    const res = await post(BODY);
    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({
      code: 'MIGRATION_REQUIRED', message: 'Datenbank-Migration 001 wurde noch nicht ausgeführt', status: 503,
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('503 DB_UNAVAILABLE when the DB connection fails inside the transaction', async () => {
    const down = new Error('connect ECONNREFUSED');
    down.code = 'ECONNREFUSED';
    pool.getConnection.mockRejectedValue(down);
    const res = await post(BODY);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DB_UNAVAILABLE');
  });
});

describe('POST /api/products — Body, den express.json ablehnt (DECISIONS #89)', () => {
  it('broken JSON -> 400 VALIDATION_ERROR, not logged', async () => {
    const res = await request(app).post('/api/products').set('Content-Type', 'application/json').send('{"lebtab_lmc": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Ungültiges JSON im Request-Body', status: 400 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('body larger than 1 MB -> 400 "Anfrage zu groß (maximal 1 MB)", not logged', async () => {
    const big = { ...BODY, lebtab_Bezeich: 'x', filler: 'y'.repeat(1024 * 1024 + 100) };
    const res = await request(app).post('/api/products').send(big);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Anfrage zu groß (maximal 1 MB)', status: 400 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('unsupported charset -> 400 "Zeichensatz der Anfrage wird nicht unterstützt", not logged', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send(JSON.stringify(BODY));
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Zeichensatz der Anfrage wird nicht unterstützt', status: 400 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('unsupported content encoding -> 400 "Kodierung der Anfrage wird nicht unterstützt"', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'zstd')
      .send(JSON.stringify(BODY));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Kodierung der Anfrage wird nicht unterstützt');
  });

  it('no JSON content type (text/plain) -> 400 with field body', async () => {
    const res = await request(app).post('/api/products').set('Content-Type', 'text/plain').send('lebtab_lmc=ZZT001');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'body', issue: 'muss ein JSON-Objekt sein' }]);
  });

  it('a JSON array as body -> 400 with field body', async () => {
    const res = await post([BODY]);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'body', issue: 'muss ein JSON-Objekt sein' }]);
  });
});
