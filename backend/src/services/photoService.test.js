import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Eigenes Temp-Verzeichnis je Testdatei — backend/uploads/ wird nie beruehrt (docs/ARCHITECTURE.md 8.3 #8).
vi.mock('../config/uploadDir.js', async () => {
  const nodeFs = await import('node:fs');
  const os = await import('node:os');
  const nodePath = await import('node:path');
  return { UPLOAD_DIR: nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'lebtab-photos-')) };
});
vi.mock('../config/db.js', () => ({ pool: {} }));
vi.mock('../models/lebtabModel.js', () => ({ findStoredLmc: vi.fn() }));

import { UPLOAD_DIR } from '../config/uploadDir.js';
import { pool } from '../config/db.js';
import * as lebtabModel from '../models/lebtabModel.js';
import { PHOTO_MAX_PER_PRODUCT } from '../utils/limits.js';
import { resolveLmc, listPhotos, addPhotos, deletePhoto, cleanTmpDir } from './photoService.js';

const LMC = 'A1CK00';
const TMP = path.join(UPLOAD_DIR, 'tmp');
const ACTIVE = path.join(UPLOAD_DIR, 'active');
const PRODUCT_DIR = path.join(ACTIVE, LMC);
const SENTINEL = path.join(UPLOAD_DIR, 'secret.txt');

let counter = 0;
/** Legt eine Datei in tmp/ an und liefert das Objekt, das multer in req.files ablegt. */
function tmpFile(originalname, content = 'img') {
  fs.mkdirSync(TMP, { recursive: true });
  const filePath = path.join(TMP, `upload-${(counter += 1)}`);
  fs.writeFileSync(filePath, content);
  return { path: filePath, originalname, size: Buffer.byteLength(content) };
}

function seedActive(count) {
  fs.mkdirSync(PRODUCT_DIR, { recursive: true });
  for (let i = 0; i < count; i += 1) fs.writeFileSync(path.join(PRODUCT_DIR, `10000000000${i}0-alt.jpg`), 'old');
}

const activeNames = () => (fs.existsSync(PRODUCT_DIR) ? fs.readdirSync(PRODUCT_DIR).sort() : []);
const tmpNames = () => (fs.existsSync(TMP) ? fs.readdirSync(TMP) : []);

beforeEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.rmSync(ACTIVE, { recursive: true, force: true });
  fs.writeFileSync(SENTINEL, 'keep me');
  lebtabModel.findStoredLmc.mockReset();
  lebtabModel.findStoredLmc.mockResolvedValue(LMC);
});
afterAll(() => fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }));

describe('resolveLmc', () => {
  it('returns the spelling stored in the DB', async () => {
    expect(await resolveLmc('a1ck00')).toBe(LMC);
    expect(lebtabModel.findStoredLmc).toHaveBeenCalledWith('a1ck00', pool);
  });

  it('404 PRODUCT_NOT_FOUND for an unknown product', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue(null);
    await expect(resolveLmc('ZZZZZZ')).rejects.toMatchObject({
      status: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Produkt nicht gefunden',
    });
  });

  it.each(['abc', 'A1CK000', '../..', ''])('404 for the malformed lmc %j without touching the DB', async (bad) => {
    await expect(resolveLmc(bad)).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    expect(lebtabModel.findStoredLmc).not.toHaveBeenCalled();
  });
});

describe('listPhotos', () => {
  it('returns [] while the product has no folder', async () => {
    expect(await listPhotos(LMC)).toEqual([]);
  });

  it('lists the photos sorted by filename with url, size and ISO modifiedAt', async () => {
    fs.mkdirSync(PRODUCT_DIR, { recursive: true });
    fs.writeFileSync(path.join(PRODUCT_DIR, '1700000000002-b.png'), '12345');
    fs.writeFileSync(path.join(PRODUCT_DIR, '1700000000001-a.jpg'), '123');
    const photos = await listPhotos('a1ck00');
    expect(photos.map((p) => p.filename)).toEqual(['1700000000001-a.jpg', '1700000000002-b.png']);
    expect(photos[0]).toEqual({
      filename: '1700000000001-a.jpg',
      url: '/uploads/A1CK00/1700000000001-a.jpg',
      size: 3,
      modifiedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    expect(Object.keys(photos[1])).toEqual(['filename', 'url', 'size', 'modifiedAt']);
  });

  it('ignores sub-folders, non-image files and names the API could not address', async () => {
    fs.mkdirSync(path.join(PRODUCT_DIR, 'unterordner.jpg'), { recursive: true });
    for (const name of ['Thumbs.db', 'notiz.txt', 'foto 1.jpg', 'ok.webp']) {
      fs.writeFileSync(path.join(PRODUCT_DIR, name), 'x');
    }
    expect((await listPhotos(LMC)).map((p) => p.filename)).toEqual(['ok.webp']);
  });

  it('404 PRODUCT_NOT_FOUND for an unknown product', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue(null);
    await expect(listPhotos('ZZZZZZ')).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
  });
});

describe('addPhotos', () => {
  it('moves every file from tmp/ into active/<lmc as stored>/ and returns the full list', async () => {
    const before = Date.now();
    const photos = await addPhotos(LMC, [tmpFile('Käse Brot.jpg', 'aaaa'), tmpFile('zwei.PNG', 'bb')]);
    expect(tmpNames()).toEqual([]);
    expect(photos).toHaveLength(2);
    expect(photos.map((p) => p.filename)).toEqual(activeNames());
    const first = photos.find((p) => p.filename.endsWith('-K_se_Brot.jpg'));
    expect(first.size).toBe(4);
    expect(Number(first.filename.split('-')[0])).toBeGreaterThanOrEqual(before);
    expect(first.url).toBe(`/uploads/${LMC}/${first.filename}`);
  });

  it('fills the product up to exactly the limit', async () => {
    seedActive(PHOTO_MAX_PER_PRODUCT - 2);
    const photos = await addPhotos(LMC, [tmpFile('a.jpg'), tmpFile('b.jpg')]);
    expect(photos).toHaveLength(PHOTO_MAX_PER_PRODUCT);
    expect(activeNames()).toHaveLength(PHOTO_MAX_PER_PRODUCT);
    expect(tmpNames()).toEqual([]);
  });

  it('rejects the whole request with PHOTO_LIMIT_EXCEEDED: tmp/ cleaned, active/ unchanged', async () => {
    seedActive(8);
    const snapshot = activeNames();
    const files = [tmpFile('a.jpg'), tmpFile('b.jpg'), tmpFile('c.jpg')];
    await expect(addPhotos(LMC, files)).rejects.toMatchObject({
      status: 400,
      code: 'PHOTO_LIMIT_EXCEEDED',
      message: 'Maximal 10 Fotos pro Produkt',
      details: [{ field: 'photos', issue: 'Maximal 10 Fotos pro Produkt (aktuell 8, frei 2)' }],
    });
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toEqual(snapshot);
  });

  it('gives two files with the same original name two different names', async () => {
    const photos = await addPhotos(LMC, [tmpFile('image.png', 'one'), tmpFile('image.png', 'two!')]);
    expect(photos).toHaveLength(2);
    expect(new Set(photos.map((p) => p.filename)).size).toBe(2);
    expect(photos.map((p) => p.size).sort()).toEqual([3, 4]);
  });

  it('rolls back when a rename fails: nothing new in active/, tmp/ cleaned, error passed on', async () => {
    seedActive(1);
    const snapshot = activeNames();
    const realRename = fsp.rename.bind(fsp);
    const boom = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    vi.spyOn(fsp, 'rename')
      .mockImplementationOnce(realRename)
      .mockRejectedValueOnce(boom);
    const files = [tmpFile('a.jpg'), tmpFile('b.jpg'), tmpFile('c.jpg')];
    await expect(addPhotos(LMC, files)).rejects.toBe(boom);
    expect(activeNames()).toEqual(snapshot);
    expect(tmpNames()).toEqual([]);
  });

  it('runs parallel uploads of one product one after another: the limit holds and no file is overwritten', async () => {
    seedActive(PHOTO_MAX_PER_PRODUCT - 2);
    const results = await Promise.allSettled([
      addPhotos(LMC, [tmpFile('image.png', 'one')]),
      addPhotos(LMC, [tmpFile('image.png', 'two!')]),
      addPhotos(LMC, [tmpFile('image.png', 'three')]),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    expect(results[2].reason).toMatchObject({
      code: 'PHOTO_LIMIT_EXCEEDED',
      details: [{ field: 'photos', issue: 'Maximal 10 Fotos pro Produkt (aktuell 10, frei 0)' }],
    });
    expect(activeNames()).toHaveLength(PHOTO_MAX_PER_PRODUCT);
    expect(activeNames().filter((name) => name.endsWith('-image.png'))).toHaveLength(2);
    expect(tmpNames()).toEqual([]);
  });

  it('keeps accepting uploads after a failed one (the queue never stays blocked)', async () => {
    await expect(addPhotos(LMC, [])).rejects.toMatchObject({ code: 'INVALID_FILE' });
    expect(await addPhotos(LMC, [tmpFile('a.jpg')])).toHaveLength(1);
  });

  it.each([[[]], [undefined]])('400 INVALID_FILE when no file arrived (%j)', async (files) => {
    await expect(addPhotos(LMC, files)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_FILE',
      message: 'Keine Datei hochgeladen',
    });
  });

  it('400 INVALID_FILE for an empty file, nothing is stored', async () => {
    const files = [tmpFile('a.jpg'), tmpFile('leer.jpg', '')];
    await expect(addPhotos(LMC, files)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_FILE',
      message: 'Leere Datei kann nicht hochgeladen werden',
    });
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toEqual([]);
  });
});

describe('deletePhoto', () => {
  it('removes exactly one file and answers { deleted, filename }', async () => {
    seedActive(2);
    const [first, second] = activeNames();
    expect(await deletePhoto('a1ck00', first)).toEqual({ deleted: true, filename: first });
    expect(activeNames()).toEqual([second]);
  });

  it('404 PHOTO_NOT_FOUND for a file that does not exist', async () => {
    seedActive(1);
    await expect(deletePhoto(LMC, 'gibtsnicht.jpg')).rejects.toMatchObject({
      status: 404,
      code: 'PHOTO_NOT_FOUND',
      message: 'Foto nicht gefunden',
    });
    expect(activeNames()).toHaveLength(1);
  });

  it.each(['../../secret.txt', '..\\..\\secret.txt', '..', '.', 'a/../../../secret.txt', ''])(
    'never leaves the product folder for %j',
    async (filename) => {
      seedActive(1);
      await expect(deletePhoto(LMC, filename)).rejects.toMatchObject({ status: 404, code: 'PHOTO_NOT_FOUND' });
      expect(fs.readFileSync(SENTINEL, 'utf8')).toBe('keep me');
      expect(activeNames()).toHaveLength(1);
    },
  );

  it('does not delete files that are not photos (wrong extension, sub-folder)', async () => {
    fs.mkdirSync(path.join(PRODUCT_DIR, 'ordner.jpg'), { recursive: true });
    fs.writeFileSync(path.join(PRODUCT_DIR, 'notiz.txt'), 'x');
    await expect(deletePhoto(LMC, 'notiz.txt')).rejects.toMatchObject({ code: 'PHOTO_NOT_FOUND' });
    await expect(deletePhoto(LMC, 'ordner.jpg')).rejects.toMatchObject({ code: 'PHOTO_NOT_FOUND' });
    expect(activeNames()).toEqual(['notiz.txt', 'ordner.jpg']);
  });

  it('404 PRODUCT_NOT_FOUND before looking at the filename when the product is unknown', async () => {
    lebtabModel.findStoredLmc.mockResolvedValue(null);
    await expect(deletePhoto('ZZZZZZ', 'a.jpg')).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
  });
});

describe('cleanTmpDir', () => {
  it('returns 0 when tmp/ does not exist', async () => {
    expect(await cleanTmpDir()).toBe(0);
  });

  it('removes leftover files and reports how many', async () => {
    tmpFile('a.jpg');
    tmpFile('b.jpg');
    seedActive(1);
    expect(await cleanTmpDir()).toBe(2);
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toHaveLength(1);
  });
});

describe('addPhotos — the limit counts photos only', () => {
  it('does not count foreign files in the folder (Thumbs.db, sub-folder, names with spaces)', async () => {
    seedActive(PHOTO_MAX_PER_PRODUCT - 1);
    fs.mkdirSync(path.join(PRODUCT_DIR, 'unterordner'), { recursive: true });
    for (const name of ['Thumbs.db', 'notiz.txt', 'foto 1.jpg']) {
      fs.writeFileSync(path.join(PRODUCT_DIR, name), 'x');
    }
    expect(await addPhotos(LMC, [tmpFile('neu.jpg')])).toHaveLength(PHOTO_MAX_PER_PRODUCT);
  });

  it('never reports a negative number of free places when the folder already holds more than the limit', async () => {
    seedActive(PHOTO_MAX_PER_PRODUCT + 2);
    await expect(addPhotos(LMC, [tmpFile('neu.jpg')])).rejects.toMatchObject({
      code: 'PHOTO_LIMIT_EXCEEDED',
      details: [{ field: 'photos', issue: 'Maximal 10 Fotos pro Produkt (aktuell 12, frei 0)' }],
    });
    expect(tmpNames()).toEqual([]);
  });
});

describe('database errors', () => {
  it('lets a database error propagate unchanged instead of answering "no photos"', async () => {
    const dbDown = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    lebtabModel.findStoredLmc.mockRejectedValue(dbDown);
    await expect(listPhotos(LMC)).rejects.toBe(dbDown);
    await expect(deletePhoto(LMC, 'a.jpg')).rejects.toBe(dbDown);
  });
});

describe('addPhotos — product folder not usable', () => {
  it('cleans tmp/ when a plain file sits where the product folder should be', async () => {
    fs.mkdirSync(ACTIVE, { recursive: true });
    fs.writeFileSync(PRODUCT_DIR, 'kein Ordner');
    await expect(addPhotos(LMC, [tmpFile('a.jpg'), tmpFile('b.jpg')])).rejects.toMatchObject({
      code: expect.stringMatching(/^E[A-Z]+$/),
    });
    expect(tmpNames()).toEqual([]);
  });

  it('cleans tmp/ when the product folder cannot be created, error passed on', async () => {
    const boom = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    vi.spyOn(fsp, 'mkdir').mockRejectedValueOnce(boom);
    await expect(addPhotos(LMC, [tmpFile('a.jpg')])).rejects.toBe(boom);
    expect(tmpNames()).toEqual([]);
    expect(activeNames()).toEqual([]);
  });
});
