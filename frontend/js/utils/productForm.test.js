import { describe, it, expect } from 'vitest';
import { emptyProductForm, buildCreatePayload, isFormDirty } from './productForm.js';
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
