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

describe.skipIf(!dbUp)('GET /api/products (minimal)', () => {
  it('returns paging shape with exactly 4 columns per item', async () => {
    const res = await request(app).get('/api/products?page=1&pageSize=5');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 5 });
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['lebtab_Bezeich', 'lebtab_Datum', 'lebtab_Itemart', 'lebtab_lmc'].sort(),
      );
      expect(item.lebtab_lmc).toMatch(/^[A-Za-z0-9]{6}$/);
      expect(item.lebtab_Datum).toMatch(/^\d{4}-\d{2}-\d{2}$/); // dateStrings: true
    }
  });

  it('rejects pageSize > 200 with VALIDATION_ERROR', async () => {
    const res = await request(app).get('/api/products?pageSize=999');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('pageSize');
  });
});
