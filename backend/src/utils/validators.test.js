import { describe, it, expect } from 'vitest';
import { isValidLmc, isValidItemart, isValidYmd, parseIntStrict, parseIngredientId } from './validators.js';

describe('isValidLmc', () => {
  it('accepts exactly 6 alphanumeric characters', () => {
    expect(isValidLmc('A1CK00')).toBe(true);
    expect(isValidLmc('000100')).toBe(true);
    expect(isValidLmc('a1ck00')).toBe(true);
  });
  it('rejects everything else without trimming', () => {
    for (const v of ['abc', 'A1CK000', 'A1CK0 ', ' A1CK0', 'A1-K00', '../../', '', null, undefined, 123456, ['A1CK00']]) {
      expect(isValidLmc(v)).toBe(false);
    }
  });
});

describe('isValidItemart (trim, then exact — DECISIONS #59)', () => {
  it('accepts the 7 values, also with surrounding whitespace', () => {
    for (const v of ['A', 'L', 'M', 'N', 'R', 'S', 'V', 'V ', ' N']) expect(isValidItemart(v)).toBe(true);
  });
  it('rejects lower case, unknown and non-strings', () => {
    for (const v of ['v', 'X', 'VV', '', ' ', null, undefined, 1]) expect(isValidItemart(v)).toBe(false);
  });
});

describe('isValidYmd', () => {
  it('accepts real calendar dates', () => {
    expect(isValidYmd('2020-02-29')).toBe(true);
    expect(isValidYmd('1984-01-01')).toBe(true);
  });
  it('rejects impossible dates and other formats', () => {
    for (const v of ['2020-13-01', '2021-02-29', '2020-02-30', '2020-00-10', '0000-00-00', '01.08.2026', '2020-1-1', '2020-01-01T00:00', '', null]) {
      expect(isValidYmd(v)).toBe(false);
    }
  });
});

describe('parseIntStrict', () => {
  it('parses plain digit strings only', () => {
    expect(parseIntStrict('1')).toBe(1);
    expect(parseIntStrict('200')).toBe(200);
    expect(parseIntStrict('007')).toBe(7);
  });
  it('returns null for 1e2, 0x10, 1.0, signs, blanks, too long, non-strings', () => {
    for (const v of ['1e2', '0x10', '1.0', '-1', '+1', ' 1', '', '1234567890', 5, null, undefined, ['1']]) {
      expect(parseIntStrict(v)).toBeNull();
    }
  });
});

describe('parseIngredientId (Phase 7)', () => {
  it('parses plain digit strings within INT UNSIGNED', () => {
    expect(parseIngredientId('1')).toBe(1);
    expect(parseIngredientId('540973')).toBe(540973);
    expect(parseIngredientId('4294967295')).toBe(4294967295);
  });
  it('returns null for 0, 4294967296, 1e3, -1, 1.0, blanks, empty, non-strings', () => {
    for (const v of ['0', '4294967296', '1e3', '-1', '1.0', ' 1', '', '12345678901', 5, null, undefined]) {
      expect(parseIngredientId(v)).toBeNull();
    }
  });
});
