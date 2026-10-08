import { describe, it, expect } from 'vitest';
import {
  validateLmc,
  validateProductForm,
  validateIngredients,
  findDuplicateLmZutat,
  parseDetailField,
  validateMengeText,
} from './validators.js';
import { emptyProductForm } from './productForm.js';

const ITEMARTS = ['A', 'L', 'M', 'N', 'R', 'S', 'V'];
const validForm = () => ({ ...emptyProductForm('2026-10-06'), lebtab_lmc: 'ZZT001', lebtab_Bezeich: 'Test' });
const row = (tmpId, LM_Zutat, mengeText, Menge, itemart = 'L') => ({
  tmpId, LM_Zutat, mengeText, Menge, zutat: { lebtab_Bezeich: 'x', lebtab_Itemart: itemart },
});

describe('validateLmc', () => {
  it('accepts exactly 6 alphanumeric characters (after trim)', () => {
    expect(validateLmc('A1CK00')).toBeNull();
    expect(validateLmc(' zzt001 ')).toBeNull();
  });
  it('rejects empty, too short/long and special characters', () => {
    expect(validateLmc('')).toBe('darf nicht leer sein');
    expect(validateLmc('   ')).toBe('darf nicht leer sein');
    for (const bad of ['ABC', 'ABCDEFG', 'AB-C00', 'ÄBCDEF']) expect(validateLmc(bad)).toMatch(/6 Zeichen/);
  });
});

describe('validateProductForm', () => {
  it('returns {} for a valid form', () => {
    expect(validateProductForm(validForm(), ITEMARTS)).toEqual({});
  });
  it('flags the 4 NOT NULL fields when empty', () => {
    const form = { ...validForm(), lebtab_Bezeich: ' ', lebtab_Itemart: '', lebtab_Datum: '', lebtab_aktuell: '' };
    const errors = validateProductForm(form, ITEMARTS);
    expect(Object.keys(errors).sort()).toEqual(['lebtab_Bezeich', 'lebtab_Datum', 'lebtab_Itemart', 'lebtab_aktuell']);
    expect(errors.lebtab_Bezeich).toBe('darf nicht leer sein');
  });
  it('checks integers, aktuell >= 0, itemart list, date and max lengths', () => {
    const form = {
      ...validForm(), lebtab_Version: '1.5', lebtab_aktuell: '-1', lebtab_lmgruppe: 'abc',
      lebtab_Itemart: 'X', lebtab_Datum: '2020-02-30', lebtab_source: 'x'.repeat(46), lebtab_probiotisch: '-3',
    };
    const errors = validateProductForm(form, ITEMARTS);
    expect(errors).toEqual({
      lebtab_Version: 'muss eine ganze Zahl sein',
      lebtab_aktuell: 'muss eine ganze Zahl ≥ 0 sein',
      lebtab_lmgruppe: 'muss eine ganze Zahl sein',
      lebtab_Itemart: 'ungültige Itemart',
      lebtab_Datum: 'ungültiges Datum',
      lebtab_source: 'maximal 45 Zeichen',
    });
  });
  it('rejects integers beyond INT range and accepts optional fields left empty', () => {
    expect(validateProductForm({ ...validForm(), lebtab_Version: '2147483648' }, ITEMARTS)).toEqual({
      lebtab_Version: 'muss eine ganze Zahl sein',
    });
    expect(validateProductForm({ ...validForm(), lebtab_Version: '', lebtab_Marke: '' }, ITEMARTS)).toEqual({});
  });
  it('accepts INT_MIN -2147483648 like the backend (boundary agreement)', () => {
    expect(validateProductForm({ ...validForm(), lebtab_Version: '-2147483648' }, ITEMARTS)).toEqual({});
    expect(validateProductForm({ ...validForm(), lebtab_Version: '-2147483649' }, ITEMARTS)).toEqual({
      lebtab_Version: 'muss eine ganze Zahl sein',
    });
  });
  it('counts text length in code points like MariaDB and the backend (emoji = 1 Zeichen)', () => {
    const source = 'x'.repeat(44) + '😀'; // 45 Codepunkte, 46 UTF-16-Einheiten
    expect(validateProductForm({ ...validForm(), lebtab_source: source }, ITEMARTS)).toEqual({});
  });
  it('does not check the itemart list when itemarts is empty (meta not loaded)', () => {
    expect(validateProductForm({ ...validForm(), lebtab_Itemart: 'X' })).toEqual({});
  });
});

describe('validateIngredients', () => {
  it('accepts Menge 0 and decimals, rejects missing, NaN, negative and self-reference', () => {
    const rows = [
      row(1, 'L00001', '0', 0), row(2, 'L00002', '12,5', 12.5), row(3, 'L00003', '', null),
      row(4, 'L00004', 'abc', null), row(5, 'L00005', '-1', -1), row(6, 'zzt001', '5', 5),
    ];
    expect(validateIngredients(rows, 'ZZT001')).toEqual({
      3: 'Menge fehlt',
      4: 'muss eine Zahl ≥ 0 sein',
      5: 'muss eine Zahl ≥ 0 sein',
      6: 'ein Produkt kann nicht seine eigene Zutat sein',
    });
    expect(validateIngredients([], 'ZZT001')).toEqual({});
  });
});

describe('findDuplicateLmZutat / parseDetailField', () => {
  it('finds duplicates case-insensitively', () => {
    const list = [row(1, 'AFB000', '1', 1)];
    expect(findDuplicateLmZutat(list, 'afb000')).toBe(list[0]);
    expect(findDuplicateLmZutat(list, 'AFB001')).toBeNull();
  });
  it('parses ingredient fields and plain keys', () => {
    expect(parseDetailField('ingredients[3].Menge')).toEqual({ index: 3, key: 'Menge' });
    expect(parseDetailField('ingredients[0].LM_Zutat')).toEqual({ index: 0, key: 'LM_Zutat' });
    expect(parseDetailField('lebtab_Bezeich')).toEqual({ key: 'lebtab_Bezeich' });
    expect(parseDetailField('ingredients')).toEqual({ key: 'ingredients' });
  });
});

describe('validateMengeText (Phase 7, edit)', () => {
  it('empty -> "Menge fehlt"; NaN/negative -> "muss eine Zahl ≥ 0 sein"; 0 and decimals valid', () => {
    expect(validateMengeText('', null)).toBe('Menge fehlt');
    expect(validateMengeText('   ', null)).toBe('Menge fehlt');
    expect(validateMengeText('abc', null)).toBe('muss eine Zahl ≥ 0 sein');
    expect(validateMengeText('-1', -1)).toBe('muss eine Zahl ≥ 0 sein');
    expect(validateMengeText('0', 0)).toBeNull();
    expect(validateMengeText('12,5', 12.5)).toBeNull();
  });
});
