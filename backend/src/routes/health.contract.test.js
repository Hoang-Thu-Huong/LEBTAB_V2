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

describe.skipIf(!dbUp)('GET /api/health (DB laeuft)', () => {
  it('returns ok + connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });
});

describe.skipIf(dbUp)('GET /api/health (DB gestoppt)', () => {
  it('returns 503 DB_UNAVAILABLE', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DB_UNAVAILABLE');
  });
});

describe('unknown /api route', () => {
  it('returns 404 JSON with code NOT_FOUND', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Endpunkt nicht gefunden', status: 404 },
    });
  });
});
