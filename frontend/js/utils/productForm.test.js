import { describe, it, expect } from 'vitest';
import { emptyProductForm, buildCreatePayload, isFormDirty, productToForm, buildUpdatePayload, isInfoFormDirty } from './productForm.js';
import { PRODUCT_INFO_FIELDS } from './productFields.js';

const TODAY = '2026-10-06';

describe('emptyProductForm', () => {
  it('has all 13 keys as strings, Itemart V, Datum today, aktuell 1, Version empty', () => {
    const form = emptyProductForm(TODAY);
    expect(Object.keys(form)).toEqual(PRODUCT_INFO_FIELDS.map((f) => f.key));
    expect(form).toMatchObject({ lebtab_Itemart: 'V', lebtab_Datum: TODAY, lebtab_aktuell: '1', lebtab_Version: '' });
    expect(Object.values(form).every((v) => typeof v === 'string')).toBe(true);
  });
});

describe('buildCreatePayload', () => {
  it('trims strings, sends empty optional fields as null, integers as numbers, ingredients as {LM_Zutat, Menge}', () => {
    const form = { ...emptyProductForm(TODAY), lebtab_lmc: ' ZZT001 ', lebtab_Bezeich: ' Käse ', lebtab_lmgruppe: '12' };
    const payload = buildCreatePayload(form, [
      { tmpId: 1, LM_Zutat: 'L00001', mengeText: '60', Menge: 60, zutat: {} },
      { tmpId: 2, LM_Zutat: 'JVB100', mengeText: '0', Menge: 0, zutat: {} },
    ]);
    expect(payload).toEqual({
      lebtab_lmc: 'ZZT001', lebtab_Bezeich: 'Käse', lebtab_Marke: null, lebtab_Version: null, lebtab_Itemart: 'V',
      lebtab_Datum: TODAY, lebtab_aktuell: 1, lebtab_lmgruppe: 12, lebtab_gruppename: null, lebtab_source: null,
      lebtab_source_code: null, lebtab_source_detail: null, lebtab_probiotisch: null,
      ingredients: [{ LM_Zutat: 'L00001', Menge: 60 }, { LM_Zutat: 'JVB100', Menge: 0 }],
    });
    expect(payload).not.toHaveProperty('lebtab_E_CAL');
  });
  it('sends an empty ingredients array when there are no rows', () => {
    expect(buildCreatePayload(emptyProductForm(TODAY), []).ingredients).toEqual([]);
  });
});

describe('isFormDirty', () => {
  it('is false for the untouched form and true after any input or ingredient', () => {
    const form = emptyProductForm(TODAY);
    expect(isFormDirty(form, [], TODAY)).toBe(false);
    expect(isFormDirty({ ...form, lebtab_Marke: ' ' }, [], TODAY)).toBe(false); // nur Leerzeichen zaehlen nicht
    expect(isFormDirty({ ...form, lebtab_lmc: 'A' }, [], TODAY)).toBe(true);
    expect(isFormDirty({ ...form, lebtab_Itemart: 'L' }, [], TODAY)).toBe(true);
    expect(isFormDirty(form, [{ tmpId: 1 }], TODAY)).toBe(true);
  });
});

describe('edit.html Stammdaten (Phase 8): productToForm, buildUpdatePayload, isInfoFormDirty', () => {
  const PRODUCT = {
    lebtab_lmc: 'DQCO00', lebtab_Bezeich: 'Aufstrich', lebtab_Marke: null, lebtab_Version: 3, lebtab_Itemart: 'V',
    lebtab_Datum: '2013-05-10', lebtab_aktuell: 1, lebtab_lmgruppe: 0, lebtab_gruppename: null, lebtab_source: null,
    lebtab_source_code: null, lebtab_source_detail: null, lebtab_probiotisch: null, lebtab_bemerkung: 'Notiz',
    _row_version: 4, nutrition: {},
  };

  it('productToForm: 13 string fields, null -> empty, 0 stays "0"; no technical keys', () => {
    const form = productToForm(PRODUCT);
    expect(Object.keys(form)).toHaveLength(13);
    expect(form).toMatchObject({ lebtab_lmc: 'DQCO00', lebtab_Marke: '', lebtab_Version: '3', lebtab_lmgruppe: '0' });
    expect(form).not.toHaveProperty('lebtab_bemerkung');
  });

  it('buildUpdatePayload: 12 columns without lmc and without Bemerkung, empty -> explicit null, ints as numbers, + _row_version', () => {
    const form = { ...productToForm(PRODUCT), lebtab_Marke: ' Alnatura ', lebtab_Version: '', lebtab_aktuell: '2' };
    const payload = buildUpdatePayload(form, 4);
    expect(Object.keys(payload)).toHaveLength(13);
    expect(payload).not.toHaveProperty('lebtab_lmc');
    expect(payload).not.toHaveProperty('lebtab_bemerkung');
    expect(payload).toMatchObject({
      lebtab_Bezeich: 'Aufstrich', lebtab_Marke: 'Alnatura', lebtab_Version: null, lebtab_aktuell: 2,
      lebtab_gruppename: null, _row_version: 4,
    });
  });

  it('isInfoFormDirty: false right after loading and for edge spaces only; true after a real change', () => {
    const form = productToForm(PRODUCT);
    expect(isInfoFormDirty(form, PRODUCT)).toBe(false);
    expect(isInfoFormDirty({ ...form, lebtab_Bezeich: ' Aufstrich ' }, PRODUCT)).toBe(false);
    expect(isInfoFormDirty({ ...form, lebtab_Marke: 'X' }, PRODUCT)).toBe(true);
    expect(isInfoFormDirty({ ...form, lebtab_lmgruppe: '' }, PRODUCT)).toBe(true);
  });
});
