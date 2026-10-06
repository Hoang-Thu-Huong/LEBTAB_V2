import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { pool } from '../config/db.js';
import { getSchemaInfo } from '../config/schemaInfo.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';

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

// Produkt, dessen Rezeptur SOWOHL bekannte ALS AUCH unbekannte Zutaten hat.
const lmcMixed = await pick(
  `SELECT z.LMC FROM c_zutab z
     JOIN lebtab p ON p.lebtab_lmc = z.LMC
     LEFT JOIN lebtab l ON l.lebtab_lmc = z.LM_Zutat
    GROUP BY z.LMC
   HAVING SUM(l.lebtab_lmc IS NULL) > 0 AND SUM(l.lebtab_lmc IS NOT NULL) > 0
    ORDER BY z.LMC LIMIT 1`,
);
// Produkt ohne jede Rezepturzeile.
const lmcNoRecipe = await pick(
  `SELECT p.lebtab_lmc FROM lebtab p
    WHERE NOT EXISTS (SELECT 1 FROM c_zutab z WHERE z.LMC = p.lebtab_lmc)
    ORDER BY p.lebtab_lmc LIMIT 1`,
);
// Produktnummer, die es sicher nicht gibt.
const lmcMissing = (await pick(`SELECT 1 FROM lebtab WHERE lebtab_lmc = 'ZZZZZZ'`)) === null ? 'ZZZZZZ' : null;
if (dbUp) console.warn(`[contract] Fixtures: mixed=${lmcMixed} noRecipe=${lmcNoRecipe} missing=${lmcMissing}`);

const ROOT_KEYS = [
  'lebtab_lmc', 'lebtab_Bezeich', 'lebtab_Marke', 'lebtab_Version', 'lebtab_Itemart', 'lebtab_Datum',
  'lebtab_aktuell', 'lebtab_lmgruppe', 'lebtab_gruppename', 'lebtab_source', 'lebtab_source_code',
  'lebtab_source_detail', 'lebtab_probiotisch', 'nutrition', 'ingredients',
  '_row_version', 'lebtab_nutrition_stale', 'lebtab_bemerkung',
];

describe.skipIf(!dbUp)('GET /api/products/:lmc (#2, echte DB, nur SELECT)', () => {
  it.skipIf(!lmcMixed)('returns the full shape with 79 nutrition keys and joined ingredients', async () => {
    const res = await request(app).get(`/api/products/${lmcMixed}`);
    expect(res.status).toBe(200);
    const p = res.body;
    expect(Object.keys(p)).toEqual(ROOT_KEYS);
    expect(p.lebtab_lmc).toBe(lmcMixed);
    expect(p.lebtab_Datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof p.lebtab_aktuell).toBe('number');

    expect(Object.keys(p.nutrition)).toEqual([...NUTRITION_COLUMNS]);
    for (const v of Object.values(p.nutrition)) expect(v === null || typeof v === 'number').toBe(true);

    expect(p.ingredients.length).toBeGreaterThan(1);
    const ids = p.ingredients.map((r) => r.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids); // ORDER BY id
    for (const row of p.ingredients) {
      expect(Object.keys(row)).toEqual(['id', 'LMC', 'LM_Zutat', 'Menge', 'Version', 'Anrcode', 'zutat']);
      expect(typeof row.Menge).toBe('number');
      expect(typeof row.Anrcode).toBe('number');
    }
    const known = p.ingredients.find((r) => r.zutat !== null);
    const unknown = p.ingredients.find((r) => r.zutat === null);
    expect(Object.keys(known.zutat)).toEqual(['lebtab_Bezeich', 'lebtab_Itemart']);
    expect(unknown).toBeDefined();
  });

  it.skipIf(!lmcMixed)('fills technical keys with 1/0/null while migration 001 has not run', async () => {
    const { technicalColumns } = await getSchemaInfo();
    const { body } = await request(app).get(`/api/products/${lmcMixed}`);
    expect(typeof body._row_version).toBe('number');
    expect([0, 1]).toContain(body.lebtab_nutrition_stale);
    if (!technicalColumns) {
      expect(body).toMatchObject({ _row_version: 1, lebtab_nutrition_stale: 0, lebtab_bemerkung: null });
    }
  });

  it.skipIf(!lmcMixed || !/[A-Za-z]/.test(lmcMixed ?? ''))(
    'finds the product case-insensitively and answers with the spelling stored in the DB',
    async () => {
      const res = await request(app).get(`/api/products/${lmcMixed.toLowerCase()}`);
      expect(res.status).toBe(200);
      expect(res.body.lebtab_lmc).toBe(lmcMixed);
    },
  );

  it.skipIf(!lmcNoRecipe)('returns ingredients: [] for a product without recipe', async () => {
    const res = await request(app).get(`/api/products/${lmcNoRecipe}`);
    expect(res.status).toBe(200);
    expect(res.body.ingredients).toEqual([]);
  });

  it.skipIf(!lmcMissing)('404 PRODUCT_NOT_FOUND for an unknown lmc', async () => {
    const res = await request(app).get(`/api/products/${lmcMissing}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'PRODUCT_NOT_FOUND', message: 'Produkt nicht gefunden', status: 404 },
    });
  });
});

describe('malformed :lmc never reaches the DB (#2, #2b) — laeuft auch ohne DB', () => {
  it.each(['abc', 'A1CK000', 'A1-K00'])('GET and HEAD /api/products/%s -> 404', async (bad) => {
    const getRes = await request(app).get(`/api/products/${bad}`);
    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe('PRODUCT_NOT_FOUND');
    const headRes = await request(app).head(`/api/products/${bad}`);
    expect(headRes.status).toBe(404);
    expect(headRes.text ?? '').toBe('');
  });

  it('GET and HEAD with a broken % escape -> 404 NOT_FOUND, not 500 (DECISIONS #68)', async () => {
    const getRes = await request(app).get('/api/products/%E0%A4%A');
    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe('NOT_FOUND');
    const headRes = await request(app).head('/api/products/%E0%A4%A');
    expect(headRes.status).toBe(404);
    expect(headRes.text ?? '').toBe('');
  });
});

describe.skipIf(!dbUp)('HEAD /api/products/:lmc (#2b)', () => {
  it.skipIf(!lmcNoRecipe)('200 without body for an existing product', async () => {
    const res = await request(app).head(`/api/products/${lmcNoRecipe}`);
    expect(res.status).toBe(200);
    expect(res.text ?? '').toBe('');
  });
  it.skipIf(!lmcMissing)('404 without body for an unknown product', async () => {
    const res = await request(app).head(`/api/products/${lmcMissing}`);
    expect(res.status).toBe(404);
    expect(res.text ?? '').toBe('');
  });
});
