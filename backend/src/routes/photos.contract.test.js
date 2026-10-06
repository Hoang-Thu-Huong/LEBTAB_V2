import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { pool } from '../config/db.js';

const dbUp = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch((e) => {
    console.warn(`[contract] DB nicht erreichbar, DB-Tests uebersprungen: ${e.code ?? e.message}`);
    return false;
  });
const app = createApp();
afterAll(() => pool.end());

/** Ein Wert per SELECT (nur lesen); null wenn nichts gefunden. */
async function pick(sql) {
  if (!dbUp) return null;
  const [rows] = await pool.query(sql);
  return rows.length > 0 ? Object.values(rows[0])[0] : null;
}

// Erstes Produkt, dessen Nummer mindestens einen Buchstaben enthaelt (fuer den Test mit Kleinschreibung).
const lmcExisting = await pick(
  `SELECT lebtab_lmc FROM lebtab WHERE lebtab_lmc REGEXP '[A-Za-z]' ORDER BY lebtab_lmc LIMIT 1`,
);
const lmcMissing = (await pick(`SELECT 1 FROM lebtab WHERE lebtab_lmc = 'ZZZZZZ'`)) === null ? 'ZZZZZZ' : null;
if (dbUp) console.warn(`[contract] Fixtures: existing=${lmcExisting} missing=${lmcMissing}`);

// #14 liest nur: SELECT auf lebtab + Verzeichnis lesen. Kein Upload/Loeschen gegen das echte UPLOAD_DIR.
describe.skipIf(!dbUp)('GET /api/products/:lmc/photos (#14, echte DB, nur SELECT)', () => {
  it.skipIf(!lmcExisting)('200 with an array of { filename, url, size, modifiedAt }', async () => {
    const res = await request(app).get(`/api/products/${lmcExisting}/photos`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const photo of res.body) {
      expect(Object.keys(photo)).toEqual(['filename', 'url', 'size', 'modifiedAt']);
      expect(photo.url).toBe(`/uploads/${lmcExisting}/${photo.filename}`);
      expect(typeof photo.size).toBe('number');
      expect(photo.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it.skipIf(!lmcExisting)('finds the product case-insensitively', async () => {
    const res = await request(app).get(`/api/products/${lmcExisting.toLowerCase()}/photos`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it.skipIf(!lmcMissing)('404 PRODUCT_NOT_FOUND for an unknown lmc', async () => {
    const res = await request(app).get(`/api/products/${lmcMissing}/photos`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'PRODUCT_NOT_FOUND', message: 'Produkt nicht gefunden', status: 404 },
    });
  });
});

describe('malformed :lmc never reaches the DB (#14) — laeuft auch ohne DB', () => {
  it.each(['abc', 'A1CK000', 'A1-K00'])('GET /api/products/%s/photos -> 404 PRODUCT_NOT_FOUND', async (bad) => {
    const res = await request(app).get(`/api/products/${bad}/photos`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });
});
