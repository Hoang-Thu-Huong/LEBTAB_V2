import { describe, it, expect } from 'vitest';
import { parseCreateProductBody } from './productPayload.js';
import { INGREDIENT_MAX_PER_PRODUCT, MENGE_MAX } from './limits.js';

/** Minimal gueltiger Body — nur die 4 NOT-NULL-Spalten (lebtab_aktuell hat Default 1). */
function validBody(extra = {}) {
  return { lebtab_lmc: 'ZZT001', lebtab_Bezeich: 'Testprodukt', lebtab_Itemart: 'V', lebtab_Datum: '2026-10-06', ...extra };
}

/** Wirft 400 und liefert details, damit Tests gezielt Felder pruefen koennen. */
function detailsOf(body) {
  try {
    parseCreateProductBody(body);
  } catch (err) {
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Ungültige Eingabedaten' });
    return err.details;
  }
  throw new Error('expected 400');
}
const fieldsOf = (body) => detailsOf(body).map((d) => d.field);

describe('parseCreateProductBody — happy path', () => {
  it('normalizes a minimal body: 13 product keys in column order, text trimmed, missing optional -> null, aktuell 1', () => {
    const { product, ingredients } = parseCreateProductBody(validBody({ lebtab_Bezeich: '  Käse  ' }));
    expect(Object.keys(product)).toEqual([
      'lebtab_lmc', 'lebtab_Bezeich', 'lebtab_Marke', 'lebtab_Version', 'lebtab_Itemart', 'lebtab_Datum',
      'lebtab_aktuell', 'lebtab_lmgruppe', 'lebtab_gruppename', 'lebtab_source', 'lebtab_source_code',
      'lebtab_source_detail', 'lebtab_probiotisch',
    ]);
    expect(product).toEqual({
      lebtab_lmc: 'ZZT001', lebtab_Bezeich: 'Käse', lebtab_Marke: null, lebtab_Version: null, lebtab_Itemart: 'V',
      lebtab_Datum: '2026-10-06', lebtab_aktuell: 1, lebtab_lmgruppe: null, lebtab_gruppename: null,
      lebtab_source: null, lebtab_source_code: null, lebtab_source_detail: null, lebtab_probiotisch: null,
    });
    expect(ingredients).toEqual([]);
  });

  it('keeps all optional columns, empty strings become null, lmc is trimmed + uppercased, Itemart trimmed (case kept)', () => {
    const { product } = parseCreateProductBody(
      validBody({
        lebtab_lmc: ' zzt001 ', lebtab_Itemart: 'V ', lebtab_Marke: '', lebtab_Version: 3, lebtab_aktuell: 2,
        lebtab_lmgruppe: 12, lebtab_gruppename: 'Milch', lebtab_source: '  ', lebtab_source_code: '=IFA0 (o',
        lebtab_source_detail: 'x', lebtab_probiotisch: 0,
      }),
    );
    expect(product).toMatchObject({
      lebtab_lmc: 'ZZT001', lebtab_Itemart: 'V', lebtab_Marke: null, lebtab_Version: 3, lebtab_aktuell: 2,
      lebtab_lmgruppe: 12, lebtab_gruppename: 'Milch', lebtab_source: null, lebtab_source_code: '=IFA0 (o',
      lebtab_source_detail: 'x', lebtab_probiotisch: 0,
    });
  });

  it('accepts ingredients with Menge 0 and decimal Menge; trims LM_Zutat; keeps order', () => {
    const { ingredients } = parseCreateProductBody(
      validBody({ ingredients: [{ LM_Zutat: ' A1A100 ', Menge: 0 }, { LM_Zutat: 'JVB100', Menge: 12.5 }] }),
    );
    expect(ingredients).toEqual([{ LM_Zutat: 'A1A100', Menge: 0 }, { LM_Zutat: 'JVB100', Menge: 12.5 }]);
  });

  it('ignores nutrition columns, technical columns and unknown keys (never taken from the body)', () => {
    const { product } = parseCreateProductBody(
      validBody({ lebtab_E_CAL: 999, _row_version: 7, lebtab_nutrition_stale: 1, lebtab_bemerkung: 'x', foo: 'bar' }),
    );
    expect(product).not.toHaveProperty('lebtab_E_CAL');
    expect(product).not.toHaveProperty('_row_version');
    expect(product).not.toHaveProperty('lebtab_bemerkung');
    expect(product).not.toHaveProperty('foo');
  });
});

describe('parseCreateProductBody — body shape', () => {
  it.each([undefined, null, 'text', 42, []])('rejects a non-object body (%s) with field body', (body) => {
    expect(detailsOf(body)).toEqual([{ field: 'body', issue: 'muss ein JSON-Objekt sein' }]);
  });
});

describe('parseCreateProductBody — product columns', () => {
  it('collects ALL violations in one response (empty body -> 4 NOT NULL fields)', () => {
    expect(fieldsOf({})).toEqual(['lebtab_lmc', 'lebtab_Itemart', 'lebtab_Datum', 'lebtab_Bezeich']);
    for (const d of detailsOf({})) expect(d.issue).toBe('darf nicht leer sein');
  });

  it.each(['', '   ', 'ABC12', 'ABC1234', 'AB-123', 'ÄBC123', 42, null])('rejects lebtab_lmc %s', (lmc) => {
    expect(fieldsOf(validBody({ lebtab_lmc: lmc }))).toEqual(['lebtab_lmc']);
  });

  it.each(['X', 'v', 'VV', '', ' ', 5, null])('rejects lebtab_Itemart %s (exact match after trim, DECISIONS #59)', (v) => {
    const details = detailsOf(validBody({ lebtab_Itemart: v }));
    expect(details).toHaveLength(1);
    expect(details[0].field).toBe('lebtab_Itemart');
  });

  it.each(['2020-02-30', '06.10.2026', '2026-1-1', '', null, 20261006])('rejects lebtab_Datum %s', (v) => {
    expect(fieldsOf(validBody({ lebtab_Datum: v }))).toEqual(['lebtab_Datum']);
  });

  it('rejects an empty or non-string Bezeich and one longer than 255 characters (counts code points)', () => {
    expect(fieldsOf(validBody({ lebtab_Bezeich: '   ' }))).toEqual(['lebtab_Bezeich']);
    expect(fieldsOf(validBody({ lebtab_Bezeich: 123 }))).toEqual(['lebtab_Bezeich']);
    expect(fieldsOf(validBody({ lebtab_Bezeich: 'ä'.repeat(256) }))).toEqual(['lebtab_Bezeich']);
    expect(parseCreateProductBody(validBody({ lebtab_Bezeich: '😀'.repeat(255) })).product.lebtab_Bezeich).toHaveLength(510);
  });

  it.each([
    ['lebtab_Marke', 191],
    ['lebtab_gruppename', 100],
    ['lebtab_source', 45],
    ['lebtab_source_code', 45],
    ['lebtab_source_detail', 100],
  ])('enforces the DDL length of %s (%i)', (key, max) => {
    expect(parseCreateProductBody(validBody({ [key]: 'x'.repeat(max) })).product[key]).toHaveLength(max);
    expect(detailsOf(validBody({ [key]: 'x'.repeat(max + 1) }))).toEqual([
      { field: key, issue: `darf höchstens ${max} Zeichen haben` },
    ]);
  });

  it.each(['lebtab_Version', 'lebtab_lmgruppe', 'lebtab_probiotisch'])(
    '%s must be an integer in INT range or null — strings are NOT converted',
    (key) => {
      expect(parseCreateProductBody(validBody({ [key]: null })).product[key]).toBeNull();
      expect(parseCreateProductBody(validBody({ [key]: -5 })).product[key]).toBe(-5);
      for (const bad of ['3', 1.5, true, 2147483648, -2147483649, NaN]) {
        expect(fieldsOf(validBody({ [key]: bad }))).toEqual([key]);
      }
    },
  );

  it('lebtab_aktuell: missing -> 1, explicit null/negative/non-integer -> 400', () => {
    expect(parseCreateProductBody(validBody()).product.lebtab_aktuell).toBe(1);
    expect(parseCreateProductBody(validBody({ lebtab_aktuell: 0 })).product.lebtab_aktuell).toBe(0);
    expect(detailsOf(validBody({ lebtab_aktuell: null }))).toEqual([{ field: 'lebtab_aktuell', issue: 'darf nicht leer sein' }]);
    expect(fieldsOf(validBody({ lebtab_aktuell: -1 }))).toEqual(['lebtab_aktuell']);
    expect(fieldsOf(validBody({ lebtab_aktuell: '1' }))).toEqual(['lebtab_aktuell']);
  });
});

describe('parseCreateProductBody — ingredients', () => {
  it('ingredients must be a list when present (null counts as absent, DECISIONS #96)', () => {
    expect(detailsOf(validBody({ ingredients: {} }))).toEqual([{ field: 'ingredients', issue: 'muss eine Liste sein' }]);
    expect(fieldsOf(validBody({ ingredients: 'A1A100' }))).toEqual(['ingredients']);
  });

  it('rejects more than INGREDIENT_MAX_PER_PRODUCT rows', () => {
    const rows = Array.from({ length: INGREDIENT_MAX_PER_PRODUCT + 1 }, (_, i) => ({ LM_Zutat: `A${String(i).padStart(5, '0')}`, Menge: 1 }));
    expect(detailsOf(validBody({ ingredients: rows }))).toEqual([
      { field: 'ingredients', issue: `höchstens ${INGREDIENT_MAX_PER_PRODUCT} Zutaten` },
    ]);
  });

  it('names the row for a non-object element', () => {
    expect(fieldsOf(validBody({ ingredients: [{ LM_Zutat: 'A1A100', Menge: 1 }, 'A1A200'] }))).toEqual(['ingredients[1]']);
  });

  it.each(['', 'ABC', 'ABC1234', 'ab-123', 7, null, undefined])('rejects LM_Zutat %s with the row index', (code) => {
    expect(fieldsOf(validBody({ ingredients: [{ LM_Zutat: 'A1A100', Menge: 1 }, { LM_Zutat: code, Menge: 1 }] }))).toEqual([
      'ingredients[1].LM_Zutat',
    ]);
  });

  it.each(['5', -1, NaN, Infinity, MENGE_MAX + 1, null, undefined])('rejects Menge %s with the row index', (menge) => {
    expect(fieldsOf(validBody({ ingredients: [{ LM_Zutat: 'A1A100', Menge: menge }] }))).toEqual(['ingredients[0].Menge']);
  });

  it('accepts Menge exactly 0 and exactly MENGE_MAX', () => {
    const { ingredients } = parseCreateProductBody(
      validBody({ ingredients: [{ LM_Zutat: 'A1A100', Menge: 0 }, { LM_Zutat: 'A1A200', Menge: MENGE_MAX }] }),
    );
    expect(ingredients.map((r) => r.Menge)).toEqual([0, MENGE_MAX]);
  });

  it('treats ingredients: null like a missing key (no recipe)', () => {
    expect(parseCreateProductBody(validBody({ ingredients: null })).ingredients).toEqual([]);
  });

  it('rejects self-reference case-insensitively (SPEC 5.4)', () => {
    expect(detailsOf(validBody({ lebtab_lmc: 'ZZT001', ingredients: [{ LM_Zutat: 'zzt001', Menge: 10 }] }))).toEqual([
      { field: 'ingredients[0].LM_Zutat', issue: 'ein Produkt kann nicht seine eigene Zutat sein' },
    ]);
  });

  it('rejects duplicate LM_Zutat case-insensitively, naming the later row (SPEC 5.3 — hard block, no confirmDuplicate)', () => {
    const body = validBody({
      ingredients: [{ LM_Zutat: 'A1A100', Menge: 10 }, { LM_Zutat: 'B1B100', Menge: 5 }, { LM_Zutat: 'a1a100', Menge: 3 }],
    });
    expect(detailsOf(body)).toEqual([{ field: 'ingredients[2].LM_Zutat', issue: 'Zutat doppelt (bereits in Zeile 1)' }]);
  });

  it('reports product and ingredient violations together', () => {
    const fields = fieldsOf({ lebtab_lmc: 'bad', ingredients: [{ LM_Zutat: 'x', Menge: -1 }] });
    expect(fields).toEqual(expect.arrayContaining(['lebtab_lmc', 'lebtab_Bezeich', 'ingredients[0].LM_Zutat', 'ingredients[0].Menge']));
  });
});
