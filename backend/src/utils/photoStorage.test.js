import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';

// Fester Fantasiepfad: diese Tests beruehren die Platte nie.
vi.mock('../config/uploadDir.js', async () => {
  const nodePath = await import('node:path');
  return { UPLOAD_DIR: nodePath.resolve('/lebtab-test-uploads') };
});

import { UPLOAD_DIR } from '../config/uploadDir.js';
import {
  ACTIVE_DIR,
  TMP_DIR,
  PHOTO_NAME_MAX_LENGTH,
  isValidPhotoFilename,
  hasPhotoExtension,
  productDir,
  safePath,
  sanitizeFilename,
  buildPhotoFilename,
} from './photoStorage.js';

const NOT_FOUND = { status: 404, code: 'PHOTO_NOT_FOUND', message: 'Foto nicht gefunden' };

describe('photoStorage directories', () => {
  it('keeps tmp/ and active/ below UPLOAD_DIR', () => {
    expect(TMP_DIR).toBe(path.join(UPLOAD_DIR, 'tmp'));
    expect(ACTIVE_DIR).toBe(path.join(UPLOAD_DIR, 'active'));
  });
});

describe('safePath', () => {
  it('returns the absolute path below active/<lmc>/ for a valid name', () => {
    expect(safePath('A1CK00', '1700000000000-Kaese_1.jpg')).toBe(
      path.join(UPLOAD_DIR, 'active', 'A1CK00', '1700000000000-Kaese_1.jpg'),
    );
  });

  it.each([
    ['..'],
    ['.'],
    ['../secret.txt'],
    ['a/../b.jpg'],
    ['a/b.jpg'],
    ['a\\b.jpg'],
    ['..\\..\\secret.txt'],
    ['..jpg'],
    ['a..b.jpg'],
    ['foto käse.jpg'],
    ['foto 1.jpg'],
    [''],
    [undefined],
    [null],
    [42],
  ])('rejects the filename %j with 404 PHOTO_NOT_FOUND', (filename) => {
    expect(() => safePath('A1CK00', filename)).toThrowError(expect.objectContaining(NOT_FOUND));
  });

  it.each([['abc'], ['A1CK000'], ['A1-K00'], ['..'], ['../A1'], [''], [undefined]])(
    'rejects the lmc %j with 404 PHOTO_NOT_FOUND',
    (lmc) => {
      expect(() => safePath(lmc, 'a.jpg')).toThrowError(expect.objectContaining(NOT_FOUND));
      expect(() => productDir(lmc)).toThrowError(expect.objectContaining(NOT_FOUND));
    },
  );
});

describe('isValidPhotoFilename / hasPhotoExtension', () => {
  it('accepts letters, digits, dot, underscore and hyphen only', () => {
    expect(isValidPhotoFilename('1700000000000-Foto_1.v2.JPG')).toBe(true);
    expect(isValidPhotoFilename('a b.jpg')).toBe(false);
    expect(isValidPhotoFilename('a..jpg')).toBe(false);
    expect(isValidPhotoFilename('')).toBe(false);
  });

  it('knows the 5 image extensions without regard to case', () => {
    for (const name of ['a.png', 'a.jpg', 'a.JPG', 'a.jpeg', 'a.Gif', 'a.webp']) {
      expect(hasPhotoExtension(name)).toBe(true);
    }
    for (const name of ['a.html', 'a.svg', 'a.jpg.txt', 'jpg', 'Thumbs.db', '', undefined]) {
      expect(hasPhotoExtension(name)).toBe(false);
    }
  });
});

describe('sanitizeFilename', () => {
  it.each([
    ['Käse Brot.jpg', 'K_se_Brot.jpg'],
    ['foto (1).PNG', 'foto__1_.PNG'],
    ['a/b\\c.gif', 'a_b_c.gif'],
    ['..\\..\\evil.jpg', '_._evil.jpg'],
    ['bild..jpg', 'bild.jpg'],
    ['.hidden.jpg', 'hidden.jpg'],
    ['.jpg', 'foto.jpg'],
    ['...', 'foto'],
    ['', 'foto'],
    ['name.', 'name'],
  ])('turns %j into %j', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it('shortens long names to the maximum length and keeps the extension', () => {
    const result = sanitizeFilename(`${'x'.repeat(300)}.jpeg`);
    expect(result).toHaveLength(PHOTO_NAME_MAX_LENGTH);
    expect(result.endsWith('.jpeg')).toBe(true);
  });

  it('always produces a name that isValidPhotoFilename accepts', () => {
    const nasty = ['..', '....jpg', 'a...b..c.png', '../../x.gif', ' .jpg', 'ä.ö.ü.webp', `${'.'.repeat(150)}jpg`];
    for (const input of nasty) expect(isValidPhotoFilename(sanitizeFilename(input))).toBe(true);
  });

  it('never leaves ".." behind when a long name is cut exactly at a dot', () => {
    const result = sanitizeFilename(`${'a'.repeat(95)}.x.x.x.jpg`);
    expect(result).toBe(`${'a'.repeat(95)}.jpg`);
    expect(isValidPhotoFilename(result)).toBe(true);
  });
});

describe('buildPhotoFilename', () => {
  it('prefixes the sanitized name with the timestamp', () => {
    expect(buildPhotoFilename('Käse Brot.jpg', 1700000000000)).toBe('1700000000000-K_se_Brot.jpg');
  });
});
