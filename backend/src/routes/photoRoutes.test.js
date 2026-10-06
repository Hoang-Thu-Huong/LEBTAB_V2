import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

// Laeuft OHNE Datenbank: Model gemockt, Uploads in ein eigenes Temp-Verzeichnis (nie backend/uploads/).
vi.mock('../config/uploadDir.js', async () => {
  const nodeFs = await import('node:fs');
  const os = await import('node:os');
  const nodePath = await import('node:path');
  return { UPLOAD_DIR: nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'lebtab-photo-routes-')) };
});
vi.mock('../config/db.js', () => ({ pool: {} }));
vi.mock('../models/lebtabModel.js', () => ({ findStoredLmc: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { UPLOAD_DIR } from '../config/uploadDir.js';
import * as lebtabModel from '../models/lebtabModel.js';
import { PHOTO_MAX_SIZE } from '../utils/limits.js';
import { createApp } from '../app.js';

const LMC = 'A1CK00';
const TMP = path.join(UPLOAD_DIR, 'tmp');
const ACTIVE = path.join(UPLOAD_DIR, 'active');
const PRODUCT_DIR = path.join(ACTIVE, LMC);
const SENTINEL = path.join(UPLOAD_DIR, 'secret.txt');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const URL = `/api/products/${LMC}/photos`;

const app = createApp();
const png = (filename) => ({ filename, contentType: 'image/png' });
const tmpNames = () => (fs.existsSync(TMP) ? fs.readdirSync(TMP) : []);
const activeNames = () => (fs.existsSync(PRODUCT_DIR) ? fs.readdirSync(PRODUCT_DIR).sort() : []);

function seedActive(count) {
  fs.mkdirSync(PRODUCT_DIR, { recursive: true });
  for (let i = 0; i < count; i += 1) fs.writeFileSync(path.join(PRODUCT_DIR, `10000000000${i}0-alt.jpg`), 'old');
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.rmSync(ACTIVE, { recursive: true, force: true });
  fs.writeFileSync(SENTINEL, 'keep me');
  lebtabModel.findStoredLmc.mockReset();
  lebtabModel.findStoredLmc.mockResolvedValue(LMC);
});
afterAll(() => fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }));

describe('GET /api/products/:lmc/photos (#14)', () => {
  it('200 [] for a product without photos', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('404 PRODUCT_NOT_FOUND for an unknown and for a malformed lmc', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue(null);
    for (const lmc of ['ZZZZZZ', 'abc']) {
      const res = await request(app).get(`/api/products/${lmc}/photos`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    }
  });
});

describe('POST /api/products/:lmc/photos (#15)', () => {
  it('201 with the full list; the files are served below /uploads/<lmc>/', async () => {
    const res = await request(app)
      .post('/api/products/a1ck00/photos')
      .attach('photos', PNG, png('Käse Brot.png'))
      .attach('photos', PNG, png('zwei.png'));
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((p) => p.filename)).toEqual(activeNames());
    expect(res.body[0].filename).toMatch(/^\d{13}-K_se_Brot\.png$/);
    expect(res.body[0]).toMatchObject({ url: `/uploads/${LMC}/${res.body[0].filename}`, size: PNG.length });
    expect(tmpNames()).toEqual([]);

    const img = await request(app).get(res.body[0].url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(img.body, PNG)).toBe(0);
  });

  it('404 PRODUCT_NOT_FOUND before multer stores anything', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue(null);
    const res = await request(app).post('/api/products/ZZZZZZ/photos').attach('photos', PNG, png('a.png'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(tmpNames()).toEqual([]);
    expect(fs.existsSync(ACTIVE)).toBe(false);
  });

  it('answers 404 (not a broken connection) even while a large upload is still being sent', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/products/ZZZZZZ/photos')
      .attach('photos', Buffer.alloc(PHOTO_MAX_SIZE, 1), png('gross.png'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(tmpNames()).toEqual([]);
  }, 30000);

  it('three parallel uploads at 9 photos: exactly one succeeds, the product ends with 10', async () => {
    seedActive(9);
    const post = () => request(app).post(URL).attach('photos', PNG, png('a.png'));
    const results = await Promise.all([post(), post(), post()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400]);
    expect(results.filter((r) => r.status === 400).map((r) => r.body.error.code)).toEqual([
      'PHOTO_LIMIT_EXCEEDED',
      'PHOTO_LIMIT_EXCEEDED',
    ]);
    expect(activeNames()).toHaveLength(10);
    expect(tmpNames()).toEqual([]);
  });

  it.each([
    ['a text file', 'notiz.txt', 'text/plain'],
    ['an HTML file declared as image/png', 'evil.html', 'image/png'],
    ['an SVG', 'bild.svg', 'image/svg+xml'],
    ['an image extension with a non-image type', 'bild.png', 'application/octet-stream'],
  ])('400 INVALID_FILE for %s — also the valid file of the same request is not stored', async (_n, filename, contentType) => {
    const res = await request(app)
      .post(URL)
      .attach('photos', PNG, png('ok.png'))
      .attach('photos', Buffer.from('<script>alert(1)</script>'), { filename, contentType });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'INVALID_FILE', message: 'Nur Bilder (PNG, JPEG, GIF, WebP) sind erlaubt', status: 400 },
    });
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toEqual([]);
  });

  it('400 INVALID_FILE for more than 10 files in one request', async () => {
    let req = request(app).post(URL);
    for (let i = 0; i < 11; i += 1) req = req.attach('photos', PNG, png(`f${i}.png`));
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_FILE',
      message: 'Zu viele Dateien (maximal 10 pro Upload)',
      status: 400,
    });
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toEqual([]);
  });

  it('400 INVALID_FILE for a file of PHOTO_MAX_SIZE + 1 bytes, 201 for exactly PHOTO_MAX_SIZE', async () => {
    const tooBig = await request(app).post(URL).attach('photos', Buffer.alloc(PHOTO_MAX_SIZE + 1, 1), png('gross.png'));
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toEqual({ code: 'INVALID_FILE', message: 'Datei zu groß (maximal 10 MB)', status: 400 });
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toEqual([]);

    const justOk = await request(app).post(URL).attach('photos', Buffer.alloc(PHOTO_MAX_SIZE, 1), png('genau.png'));
    expect(justOk.status).toBe(201);
    expect(justOk.body[0].size).toBe(PHOTO_MAX_SIZE);
  }, 30000);

  it('400 INVALID_FILE for a wrong field name', async () => {
    const res = await request(app).post(URL).attach('bilder', PNG, png('a.png'));
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_FILE',
      message: 'Unerwartetes Dateifeld (erwartet: photos)',
      status: 400,
    });
    expect(tmpNames()).toEqual([]);
  });

  it('400 INVALID_FILE when the request carries no file (empty multipart, JSON body)', async () => {
    const empty = await request(app).post(URL).field('note', 'nur Text');
    const json = await request(app).post(URL).send({ photos: [] });
    for (const res of [empty, json]) {
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({ code: 'INVALID_FILE', message: 'Keine Datei hochgeladen', status: 400 });
    }
  });

  it('400 PHOTO_LIMIT_EXCEEDED with details when the product would exceed 10 photos', async () => {
    seedActive(9);
    const snapshot = activeNames();
    const res = await request(app).post(URL).attach('photos', PNG, png('a.png')).attach('photos', PNG, png('b.png'));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'PHOTO_LIMIT_EXCEEDED',
        message: 'Maximal 10 Fotos pro Produkt',
        status: 400,
        details: [{ field: 'photos', issue: 'Maximal 10 Fotos pro Produkt (aktuell 9, frei 1)' }],
      },
    });
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toEqual(snapshot);
  });
});

describe('DELETE /api/products/:lmc/photos/:filename (#16)', () => {
  it('200 { deleted, filename }, then 404 PHOTO_NOT_FOUND', async () => {
    seedActive(2);
    const [first, second] = activeNames();
    const res = await request(app).delete(`${URL}/${first}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, filename: first });
    expect(activeNames()).toEqual([second]);

    const again = await request(app).delete(`${URL}/${first}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: { code: 'PHOTO_NOT_FOUND', message: 'Foto nicht gefunden', status: 404 } });
  });

  it.each(['..%2F..%2Fsecret.txt', '..%5C..%5Csecret.txt', 'a%20b.jpg', 'notiz.txt'])(
    '404 PHOTO_NOT_FOUND for the filename %s — nothing outside the product folder is touched',
    async (encoded) => {
      seedActive(1);
      const res = await request(app).delete(`${URL}/${encoded}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PHOTO_NOT_FOUND');
      expect(fs.readFileSync(SENTINEL, 'utf8')).toBe('keep me');
      expect(activeNames()).toHaveLength(1);
    },
  );

  // '..' bzw. '%2E%2E' als letztes Pfadsegment loest schon der HTTP-Client auf (URL-Normalisierung): die Anfrage
  // trifft DELETE /api/products/<lmc>/ — dort gibt es keine Route. Hauptsache: 404 und nichts geloescht.
  it.each(['..', '%2E%2E'])('404 for the filename %s (never reaches the photo route)', async (encoded) => {
    seedActive(1);
    const res = await request(app).delete(`${URL}/${encoded}`);
    expect(res.status).toBe(404);
    expect(fs.readFileSync(SENTINEL, 'utf8')).toBe('keep me');
    expect(activeNames()).toHaveLength(1);
  });
});

describe('static mount /uploads', () => {
  it('serves active/ only — archive/ and tmp/ are not reachable', async () => {
    fs.mkdirSync(path.join(UPLOAD_DIR, 'archive', LMC, '1'), { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, 'archive', LMC, '1', 'alt.png'), PNG);
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(path.join(TMP, 'rest.png'), PNG);
    for (const url of [`/uploads/archive/${LMC}/1/alt.png`, '/uploads/tmp/rest.png', '/uploads/../secret.txt']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
    }
    fs.rmSync(path.join(UPLOAD_DIR, 'archive'), { recursive: true, force: true });
  });
});

describe('database not reachable', () => {
  it('503 DB_UNAVAILABLE for list and upload — never an empty list, no file is stored', async () => {
    const dbDown = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    lebtabModel.findStoredLmc.mockRejectedValue(dbDown);
    const list = await request(app).get(URL);
    const upload = await request(app).post(URL).attach('photos', PNG, png('a.png'));
    for (const res of [list, upload]) {
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('DB_UNAVAILABLE');
    }
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toEqual([]);
  });
});
