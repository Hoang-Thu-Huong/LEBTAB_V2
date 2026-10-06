import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { pool } from '../config/db.js';
import { ITEMARTS } from '../utils/itemarts.js';
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

describe.skipIf(!dbUp)('GET /api/meta (#13)', () => {
  it('returns groups, 79 fields, fixed itemarts, boolean features and limits', async () => {
    const res = await request(app).get('/api/meta');
    expect(res.status).toBe(200);
    const meta = res.body;
    expect(meta.itemarts).toEqual([...ITEMARTS]);
    expect(meta.nutritionGroups.map((g) => g.id)).toEqual([
      'energie', 'kohlenhydrate', 'fette', 'vitamine', 'mineralstoffe', 'aminosaeuren',
    ]);
    expect(meta.nutritionFields.map((f) => f.key)).toEqual([...NUTRITION_COLUMNS]);
    for (const f of meta.nutritionFields) {
      expect(Object.keys(f)).toEqual(['key', 'label', 'group', 'unit']);
      expect(f.unit).toBeNull();
    }
    expect(typeof meta.features.technicalColumns).toBe('boolean');
    expect(typeof meta.features.archive).toBe('boolean');
    expect(meta.limits).toEqual({ photoMaxPerProduct: 10, photoMaxSize: 10485760, bemerkungMaxLength: 10000 });
  });
});
