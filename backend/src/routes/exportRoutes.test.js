import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import request from 'supertest';

// Laeuft OHNE Datenbank: Pool und die beiden Stream-Funktionen der Models sind gemockt.
vi.mock('../config/db.js', () => ({ pool: { getConnection: vi.fn() } }));
vi.mock('../models/lebtabModel.js', () => ({ streamExportRows: vi.fn() }));
vi.mock('../models/czutabModel.js', () => ({ streamExportRows: vi.fn(), findColumnNames: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { pool } from '../config/db.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { logger } from '../utils/logger.js';
import { CSV_BOM, CSV_CHUNK_SIZE } from '../utils/csvFormatter.js';
import { LEBTAB_EXPORT_COLUMNS } from '../utils/exportColumns.js';
import { exportFilename } from '../services/exportService.js';
import { createApp } from '../app.js';

const app = createApp();
const ZUTAT = { id: 7, LMC: 'A1CK00', LM_Zutat: '000100', Menge: 12.5, Version: 3, Anrcode: 0 };
const MANY = Math.ceil((CSV_CHUNK_SIZE * 3) / 30);
let conn;

/** Antwort als rohe Bytes lesen — so bleibt das BOM sichtbar. */
const download = (url) =>
  request(app)
    .get(url)
    .buffer(true)
    .parse((res, callback) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });

function* zutatRows(count, failAt = -1, error = null) {
  for (let i = 0; i < count; i += 1) {
    if (i === failAt) throw error;
    yield { ...ZUTAT, id: i + 1 };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  conn = { connection: Object.assign(new EventEmitter(), { raw: true }), release: vi.fn(), destroy: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
  czutabModel.findColumnNames.mockResolvedValue(['id', 'LMC', 'LM_Zutat', 'Menge', 'Version', 'Anrcode']);
});

describe('GET /api/export (#12)', () => {
  it('200: lebtab as CSV download with BOM, header line and today in the file name', async () => {
    const row = Object.fromEntries(LEBTAB_EXPORT_COLUMNS.map((column) => [column, null]));
    Object.assign(row, { lebtab_lmc: 'A1CK00', lebtab_Bezeich: 'Joghurt "Activia"', lebtab_Datum: '2016-07-26' });
    lebtabModel.streamExportRows.mockReturnValue(Readable.from([row]));

    const res = await download('/api/export?type=lebtab');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${exportFilename('lebtab')}"`);
    expect(res.headers['content-disposition']).toMatch(/filename="lebtab_export_\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect([...res.body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = res.body.toString('utf8').slice(CSV_BOM.length).split('\r\n');
    expect(lines[0]).toBe(LEBTAB_EXPORT_COLUMNS.join(';'));
    expect(lines[1].startsWith('A1CK00;"Joghurt ""Activia""";;;;2016-07-26;')).toBe(true);
    expect(lines).toHaveLength(3);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  it('200: c_zutab with the columns of the table and its own file name', async () => {
    czutabModel.streamExportRows.mockReturnValue(Readable.from([ZUTAT]));
    const res = await download('/api/export?type=c_zutab');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${exportFilename('c_zutab')}"`);
    expect(res.body.toString('utf8')).toBe(`${CSV_BOM}id;LMC;LM_Zutat;Menge;Version;Anrcode\r\n7;A1CK00;000100;12,5;3;0\r\n`);
  });

  it('200: delivers a file of several blocks completely', async () => {
    czutabModel.streamExportRows.mockReturnValue(Readable.from(zutatRows(MANY)));
    const res = await download('/api/export?type=c_zutab');
    expect(res.status).toBe(200);
    expect(res.body.toString('utf8').split('\r\n')).toHaveLength(MANY + 2);
  });

  it.each([
    ['/api/export'],
    ['/api/export?type='],
    ['/api/export?type=x'],
    ['/api/export?type=LEBTAB'],
    ['/api/export?type=lebtab_archive'],
    ['/api/export?type=lebtab&type=c_zutab'],
  ])('400 VALIDATION_ERROR as JSON for %s — without touching the database', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Ungültige Anfrageparameter',
      details: [{ field: 'type', issue: 'muss lebtab oder c_zutab sein' }],
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('503 DB_UNAVAILABLE as JSON (not as a CSV file) when the database is down', async () => {
    pool.getConnection.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const res = await request(app).get('/api/export?type=lebtab');
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.body.error).toMatchObject({ code: 'DB_UNAVAILABLE', message: 'Datenbank nicht erreichbar' });
  });

  it('500 INTERNAL_ERROR as JSON when the query fails before the first row', async () => {
    lebtabModel.streamExportRows.mockReturnValue(
      new Readable({
        objectMode: true,
        read() {
          this.destroy(Object.assign(new Error("Unknown column 'lebtab_X'"), { code: 'ER_BAD_FIELD_ERROR' }));
        },
      }),
    );
    const res = await request(app).get('/api/export?type=lebtab');
    expect(res.status).toBe(500);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Interner Serverfehler', status: 500 });
    expect(conn.destroy).toHaveBeenCalledTimes(1);
  });

  it('breaks the connection when the database fails mid-file, so no truncated file looks complete', async () => {
    const lost = Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' });
    czutabModel.streamExportRows.mockReturnValue(Readable.from(zutatRows(MANY, MANY - 5, lost)));
    await expect(download('/api/export?type=c_zutab')).rejects.toThrow(/aborted|socket hang up|ECONNRESET/i);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('CSV-Export abgebrochen', expect.objectContaining({ type: 'c_zutab' }));
  });

  it('breaks the connection when the database link itself dies mid-file (error on the connection, silent row stream)', async () => {
    const lost = Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' });
    let pushed = 0;
    const source = new Readable({
      objectMode: true,
      read() {
        if (pushed < MANY) this.push({ ...ZUTAT, id: (pushed += 1) });
        else if (pushed === MANY) { pushed += 1; setImmediate(() => conn.connection.emit('error', lost)); }
      },
    });
    czutabModel.streamExportRows.mockReturnValue(source);
    await expect(download('/api/export?type=c_zutab')).rejects.toThrow(/aborted|socket hang up|ECONNRESET/i);
    expect(source.destroyed).toBe(true);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('CSV-Export abgebrochen', expect.objectContaining({ type: 'c_zutab' }));
  });

  it('answers other methods with 404 NOT_FOUND', async () => {
    const res = await request(app).post('/api/export?type=lebtab');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('index.html — export links (ARCHITECTURE 7.2)', () => {
  it('offers both tables as plain download links that say "Alle"', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<a [^>]*href="\/api\/export\?type=lebtab"[^>]* download[^>]*>Alle Produkte \(CSV\)<\/a>/);
    expect(res.text).toMatch(/<a [^>]*href="\/api\/export\?type=c_zutab"[^>]* download[^>]*>Alle Zutaten \(CSV\)<\/a>/);
  });
});
