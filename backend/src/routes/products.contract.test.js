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

const get = (qs) => request(app).get(`/api/products?${qs}`);

describe.skipIf(!dbUp)('GET /api/products (#1, echte DB, nur SELECT)', () => {
  it('returns paging shape with exactly 4 columns per item', async () => {
    const res = await get('page=1&pageSize=5');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 5 });
    expect(typeof res.body.total).toBe('number');
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['lebtab_Bezeich', 'lebtab_Datum', 'lebtab_Itemart', 'lebtab_lmc'].sort(),
      );
      expect(item.lebtab_lmc).toMatch(/^[A-Za-z0-9]{6}$/);
      expect(item.lebtab_Datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('is sorted by lebtab_lmc', async () => {
    const { body } = await get('pageSize=50');
    const lmcs = body.items.map((i) => i.lebtab_lmc.toUpperCase());
    expect([...lmcs].sort()).toEqual(lmcs);
  });

  it("search '%' is a literal, not a wildcard", async () => {
    const all = (await get('pageSize=1')).body.total;
    const res = await get(`pageSize=200&search=${encodeURIComponent('%')}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThan(all);
    for (const item of res.body.items) {
      expect(item.lebtab_Bezeich.includes('%') || item.lebtab_lmc.includes('%')).toBe(true);
    }
  });

  it("search '_' and '!' are literals too", async () => {
    const all = (await get('pageSize=1')).body.total;
    const underscore = await get('pageSize=200&search=_');
    expect(underscore.status).toBe(200);
    expect(underscore.body.total).toBeLessThan(all);
    for (const item of underscore.body.items) expect(item.lebtab_Bezeich).toContain('_');
    const bang = await get(`pageSize=200&search=${encodeURIComponent('!')}`);
    expect(bang.status).toBe(200);
    for (const item of bang.body.items) expect(item.lebtab_Bezeich).toContain('!');
  });

  it('search matches the product number as well', async () => {
    const first = (await get('pageSize=1')).body.items[0];
    const res = await get(`search=${first.lebtab_lmc}`);
    expect(res.body.items.map((i) => i.lebtab_lmc)).toContain(first.lebtab_lmc);
  });

  it('itemart=V returns only V; a list returns only listed values', async () => {
    const onlyV = await get('pageSize=200&itemart=V');
    expect(onlyV.status).toBe(200);
    expect(onlyV.body.items.length).toBeGreaterThan(0);
    expect(new Set(onlyV.body.items.map((i) => i.lebtab_Itemart))).toEqual(new Set(['V']));
    const list = await get(`pageSize=200&itemart=${encodeURIComponent('R, S')}`);
    expect(list.status).toBe(200);
    for (const item of list.body.items) expect(['R', 'S']).toContain(item.lebtab_Itemart);
  });

  it('date range is inclusive on both ends', async () => {
    const res = await get('pageSize=200&datum_from=2016-01-01&datum_to=2016-12-31');
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.lebtab_Datum >= '2016-01-01' && item.lebtab_Datum <= '2016-12-31').toBe(true);
    }
  });

  it('total uses the same WHERE as the page', async () => {
    const all = (await get('pageSize=1')).body.total;
    const filtered = (await get('pageSize=1&itemart=S')).body.total;
    expect(filtered).toBeLessThan(all);
  });

  it.each([
    ['itemart=X', 'itemart'],
    ['itemart=v', 'itemart'],
    ['itemart=V,,N', 'itemart'],
    ['datum_from=2020-13-01', 'datum_from'],
    ['datum_from=2021-01-01&datum_to=2020-01-01', 'datum_from'],
    ['search=a&search=b', 'search'],
    [`search=${'x'.repeat(256)}`, 'search'],
    ['page=1e2', 'page'],
    ['pageSize=999', 'pageSize'],
  ])('?%s -> 400 VALIDATION_ERROR on field %s', async (qs, field) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
  });
});
