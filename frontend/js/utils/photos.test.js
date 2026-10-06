import { describe, it, expect } from 'vitest';
import {
  photoCountLabel,
  canUploadPhotos,
  checkPhotoSelection,
  stepPhotoIndex,
  uploadSuccessText,
} from './photos.js';

const LIMITS = { photoMaxPerProduct: 10, photoMaxSize: 10 * 1024 * 1024 };
const file = (name, size = 1000) => ({ name, size });

describe('photoCountLabel / canUploadPhotos', () => {
  it('shows the count against the limit', () => {
    expect(photoCountLabel(0, 10)).toBe('0 / 10 Fotos');
    expect(photoCountLabel(3, 10)).toBe('3 / 10 Fotos');
    expect(photoCountLabel(12, 10)).toBe('12 / 10 Fotos');
  });

  it('allows uploading only below the limit, also when the limit is already exceeded', () => {
    expect(canUploadPhotos(0, 10)).toBe(true);
    expect(canUploadPhotos(9, 10)).toBe(true);
    expect(canUploadPhotos(10, 10)).toBe(false);
    expect(canUploadPhotos(12, 10)).toBe(false);
  });
});

describe('checkPhotoSelection', () => {
  it('accepts a selection that exactly fills the limit', () => {
    expect(checkPhotoSelection([file('a.jpg'), file('b.jpg')], 8, LIMITS)).toBeNull();
  });

  it('rejects a selection that would exceed the limit, with the same text as the backend', () => {
    expect(checkPhotoSelection([file('a.jpg'), file('b.jpg'), file('c.jpg')], 8, LIMITS)).toBe(
      'Maximal 10 Fotos pro Produkt (aktuell 8, frei 2)',
    );
  });

  it('never reports a negative number of free places', () => {
    expect(checkPhotoSelection([file('a.jpg')], 12, LIMITS)).toBe(
      'Maximal 10 Fotos pro Produkt (aktuell 12, frei 0)',
    );
  });

  it('accepts a file of exactly the maximum size and rejects one byte more, naming the file', () => {
    expect(checkPhotoSelection([file('gross.jpg', LIMITS.photoMaxSize)], 0, LIMITS)).toBeNull();
    expect(
      checkPhotoSelection([file('ok.jpg'), file('riesig.jpg', LIMITS.photoMaxSize + 1)], 0, LIMITS),
    ).toBe('Datei zu groß (maximal 10 MB): riesig.jpg');
  });

  it('takes both limits from meta.limits, not from constants', () => {
    const small = { photoMaxPerProduct: 2, photoMaxSize: 1024 * 1024 };
    expect(checkPhotoSelection([file('a.jpg'), file('b.jpg'), file('c.jpg')], 0, small)).toBe(
      'Maximal 2 Fotos pro Produkt (aktuell 0, frei 2)',
    );
    expect(checkPhotoSelection([file('a.jpg', 1024 * 1024 + 1)], 0, small)).toBe(
      'Datei zu groß (maximal 1 MB): a.jpg',
    );
  });

  it('accepts an empty selection', () => {
    expect(checkPhotoSelection([], 10, LIMITS)).toBeNull();
  });
});

describe('stepPhotoIndex', () => {
  it('moves forward and backward and wraps around at both ends', () => {
    expect(stepPhotoIndex(0, 1, 3)).toBe(1);
    expect(stepPhotoIndex(2, 1, 3)).toBe(0);
    expect(stepPhotoIndex(0, -1, 3)).toBe(2);
    expect(stepPhotoIndex(0, 1, 1)).toBe(0);
    expect(stepPhotoIndex(0, -1, 1)).toBe(0);
  });
});

describe('uploadSuccessText', () => {
  it('uses singular and plural', () => {
    expect(uploadSuccessText(1)).toBe('1 Foto hochgeladen');
    expect(uploadSuccessText(2)).toBe('2 Fotos hochgeladen');
  });
});
