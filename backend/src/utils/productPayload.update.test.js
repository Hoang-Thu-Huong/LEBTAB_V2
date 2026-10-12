import { describe, it, expect } from 'vitest';
import { parseUpdateProductBody, parseRecalculateBody } from './productPayload.js';
import { UPDATABLE_COLUMNS } from './productColumns.js';
import { BEMERKUNG_MAX_LENGTH } from './limits.js';

/** Fuehrt parse aus und liefert die details des 400-Fehlers (Test schlaegt fehl, wenn nichts geworfen wird). */
function detailsOf(parse, body) {
  try {
    parse(body);
  } catch (err) {
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    return err.details;
  }
  throw new Error('expected VALIDATION_ERROR');
}

describe('parseUpdateProductBody — PATCH semantics (SPEC 6.1 #4)', () => {
  it('takes only keys that are present: one column in, one column out', () => {
    expect(parseUpdateProductBody({ lebtab_Marke: ' Alnatura ', _row_version: 3 })).toEqual({
      changes: { lebtab_Marke: 'Alnatura' },
      _row_version: 3,
    });
  });

  it('explicit null clears a nullable column; empty text becomes null', () => {
    const res = parseUpdateProductBody({ lebtab_Marke: null, lebtab_gruppename: '  ', lebtab_lmgruppe: null, _row_version: 1 });
    expect(res.changes).toEqual({ lebtab_Marke: null, lebtab_gruppename: null, lebtab_lmgruppe: null });
  });

  it('accepts all 13 whitelist columns (the edit form sends 12, detail.html sends only Bemerkung)', () => {
    const body = {
      lebtab_Bezeich: 'Neu', lebtab_Marke: null, lebtab_Version: 2, lebtab_Itemart: 'L', lebtab_Datum: '2026-10-08',
      lebtab_aktuell: 0, lebtab_lmgruppe: 7, lebtab_gruppename: 'G', lebtab_source: 'S', lebtab_source_code: 'C',
      lebtab_source_detail: 'D', lebtab_probiotisch: null, lebtab_bemerkung: 'Notiz', _row_version: 9,
    };
    const res = parseUpdateProductBody(body);
    expect(Object.keys(res.changes)).toEqual([...UPDATABLE_COLUMNS]);
    expect(res.changes.lebtab_aktuell).toBe(0);
    expect(res._row_version).toBe(9);
  });

  it('ignores lebtab_lmc, nutrition columns, technical columns and unknown keys (never taken from the body)', () => {
    const res = parseUpdateProductBody({
      lebtab_Bezeich: 'X', lebtab_lmc: 'OTHER1', lebtab_EW: 99, lebtab_nutrition_stale: 0, foo: 1, _row_version: 2,
    });
    expect(res.changes).toEqual({ lebtab_Bezeich: 'X' });
  });

  it('only _row_version (no column) -> 400 naming the body', () => {
    expect(detailsOf(parseUpdateProductBody, { _row_version: 1 })).toEqual([
      { field: 'body', issue: 'enthält keine änderbare Spalte' },
    ]);
    expect(detailsOf(parseUpdateProductBody, { lebtab_lmc: 'A1CK00', _row_version: 1 })).toEqual([
      { field: 'body', issue: 'enthält keine änderbare Spalte' },
    ]);
  });

  it('body must be a JSON object', () => {
    for (const body of [undefined, null, [], 'x']) {
      expect(detailsOf(parseUpdateProductBody, body)).toEqual([{ field: 'body', issue: 'muss ein JSON-Objekt sein' }]);
    }
  });
});

describe('parseUpdateProductBody — validation (SPEC 6.4)', () => {
  it('_row_version is required and must be an integer >= 1', () => {
    expect(detailsOf(parseUpdateProductBody, { lebtab_Marke: 'x' })).toEqual([{ field: '_row_version', issue: 'fehlt' }]);
    for (const bad of [0, -1, 1.5, '3']) {
      const details = detailsOf(parseUpdateProductBody, { lebtab_Marke: 'x', _row_version: bad });
      expect(details[0].field).toBe('_row_version');
      expect(details[0].issue).toMatch(/^muss eine ganze Zahl zwischen 1 und/);
    }
  });

  it('the 4 NOT NULL columns reject null and empty text with "darf nicht leer sein" (details in column order)', () => {
    const details = detailsOf(parseUpdateProductBody, {
      lebtab_Bezeich: '  ', lebtab_Itemart: null, lebtab_Datum: '', lebtab_aktuell: null, _row_version: 1,
    });
    expect(details).toEqual([
      { field: 'lebtab_Bezeich', issue: 'darf nicht leer sein' },
      { field: 'lebtab_Itemart', issue: 'darf nicht leer sein' },
      { field: 'lebtab_Datum', issue: 'darf nicht leer sein' },
      { field: 'lebtab_aktuell', issue: 'darf nicht leer sein' },
    ]);
  });

  it('same column rules as create: Itemart list, date, integer range, text length', () => {
    const details = detailsOf(parseUpdateProductBody, {
      lebtab_Itemart: 'v', lebtab_Datum: '2026-02-30', lebtab_Version: '2', lebtab_aktuell: -1,
      lebtab_Marke: 'x'.repeat(192), _row_version: 1,
    });
    expect(details.map((d) => d.field)).toEqual([
      'lebtab_Marke', 'lebtab_Version', 'lebtab_Itemart', 'lebtab_Datum', 'lebtab_aktuell',
    ]);
  });

  it('collects ALL violations together with a missing _row_version', () => {
    const details = detailsOf(parseUpdateProductBody, { lebtab_Bezeich: null });
    expect(details).toEqual([
      { field: '_row_version', issue: 'fehlt' },
      { field: 'lebtab_Bezeich', issue: 'darf nicht leer sein' },
    ]);
  });
});

describe('parseUpdateProductBody — lebtab_bemerkung (SPEC 5.10)', () => {
  it('keeps the text unchanged (line breaks, leading/trailing spaces)', () => {
    const text = '\n  Rezeptur geprüft\nZeile 2  ';
    expect(parseUpdateProductBody({ lebtab_bemerkung: text, _row_version: 1 }).changes).toEqual({ lebtab_bemerkung: text });
  });

  it('empty after trim() or null -> null (clears the note)', () => {
    expect(parseUpdateProductBody({ lebtab_bemerkung: ' \n ', _row_version: 1 }).changes).toEqual({ lebtab_bemerkung: null });
    expect(parseUpdateProductBody({ lebtab_bemerkung: null, _row_version: 1 }).changes).toEqual({ lebtab_bemerkung: null });
  });

  it(`at most ${BEMERKUNG_MAX_LENGTH} characters (code points), must be text`, () => {
    const max = '€'.repeat(BEMERKUNG_MAX_LENGTH);
    expect(parseUpdateProductBody({ lebtab_bemerkung: max, _row_version: 1 }).changes.lebtab_bemerkung).toBe(max);
    expect(detailsOf(parseUpdateProductBody, { lebtab_bemerkung: `${max}x`, _row_version: 1 })).toEqual([
      { field: 'lebtab_bemerkung', issue: `darf höchstens ${BEMERKUNG_MAX_LENGTH} Zeichen haben` },
    ]);
    expect(detailsOf(parseUpdateProductBody, { lebtab_bemerkung: 5, _row_version: 1 })).toEqual([
      { field: 'lebtab_bemerkung', issue: 'muss ein Text sein' },
    ]);
  });
});

describe('parseRecalculateBody (SPEC 6.1 #6)', () => {
  const RECIPE = 'a'.repeat(40);

  it('returns _row_version and recipeVersion; recipeVersion is optional', () => {
    expect(parseRecalculateBody({ _row_version: 4, recipeVersion: RECIPE })).toEqual({ _row_version: 4, recipeVersion: RECIPE });
    expect(parseRecalculateBody({ _row_version: 4 })).toEqual({ _row_version: 4, recipeVersion: null });
    expect(parseRecalculateBody({ _row_version: 4, recipeVersion: null })).toEqual({ _row_version: 4, recipeVersion: null });
  });

  it('ignores every other key (nutrition never comes from the client)', () => {
    expect(parseRecalculateBody({ _row_version: 1, nutrition: { lebtab_EW: 1 } })).toEqual({ _row_version: 1, recipeVersion: null });
  });

  it('_row_version required; recipeVersion must be 40 lower-case hex characters', () => {
    expect(detailsOf(parseRecalculateBody, {})).toEqual([{ field: '_row_version', issue: 'fehlt' }]);
    for (const bad of ['A'.repeat(40), 'a'.repeat(39), 42]) {
      expect(detailsOf(parseRecalculateBody, { _row_version: 1, recipeVersion: bad })).toEqual([
        { field: 'recipeVersion', issue: 'ungültiger Rezeptur-Stand' },
      ]);
    }
    expect(detailsOf(parseRecalculateBody, undefined)).toEqual([{ field: 'body', issue: 'muss ein JSON-Objekt sein' }]);
  });
});
