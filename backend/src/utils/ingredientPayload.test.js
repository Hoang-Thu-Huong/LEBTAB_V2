import { describe, it, expect } from 'vitest';
import { parseAddIngredientBody, parseUpdateIngredientBody } from './ingredientPayload.js';
import { MENGE_MAX } from './limits.js';

/** Wirft 400 und liefert details, damit Tests gezielt Felder pruefen koennen. */
function detailsOf(parse, body) {
  try {
    parse(body);
  } catch (err) {
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Ungültige Eingabedaten' });
    return err.details;
  }
  throw new Error('expected 400');
}

describe('parseAddIngredientBody (#7)', () => {
  it('normalizes a valid body: LM_Zutat trimmed (case kept), Menge as number, confirmDuplicate defaults to false', () => {
    expect(parseAddIngredientBody({ LM_Zutat: ' afb000 ', Menge: 12.5 })).toEqual({
      LM_Zutat: 'afb000', Menge: 12.5, confirmDuplicate: false,
    });
    expect(parseAddIngredientBody({ LM_Zutat: 'AFB000', Menge: 0, confirmDuplicate: true })).toEqual({
      LM_Zutat: 'AFB000', Menge: 0, confirmDuplicate: true,
    });
  });

  it('ignores unknown keys (LMC, id, Version, Anrcode are never taken from the body)', () => {
    const input = parseAddIngredientBody({ LM_Zutat: 'AFB000', Menge: 1, LMC: 'X', id: 5, Version: 3, Anrcode: 4 });
    expect(Object.keys(input)).toEqual(['LM_Zutat', 'Menge', 'confirmDuplicate']);
  });

  it.each([
    [{ Menge: 1 }, 'darf nicht leer sein'],
    [{ LM_Zutat: '', Menge: 1 }, 'darf nicht leer sein'],
    [{ LM_Zutat: 'ABC', Menge: 1 }, 'muss genau 6 Zeichen (A–Z, 0–9) haben'],
    [{ LM_Zutat: 'AB-C00', Menge: 1 }, 'muss genau 6 Zeichen (A–Z, 0–9) haben'],
    [{ LM_Zutat: 123456, Menge: 1 }, 'darf nicht leer sein'],
  ])('rejects LM_Zutat %j', (body, issue) => {
    expect(detailsOf(parseAddIngredientBody, body)).toEqual([{ field: 'LM_Zutat', issue }]);
  });

  it.each([
    [{ LM_Zutat: 'AFB000' }, 'darf nicht leer sein'],
    [{ LM_Zutat: 'AFB000', Menge: null }, 'darf nicht leer sein'],
    [{ LM_Zutat: 'AFB000', Menge: '' }, 'darf nicht leer sein'],
    [{ LM_Zutat: 'AFB000', Menge: '12' }, 'muss eine Zahl sein'],
    [{ LM_Zutat: 'AFB000', Menge: '12,5' }, 'muss eine Zahl sein'],
    [{ LM_Zutat: 'AFB000', Menge: Number.NaN }, 'muss eine Zahl sein'],
    [{ LM_Zutat: 'AFB000', Menge: -0.001 }, 'muss 0 oder größer sein'],
    [{ LM_Zutat: 'AFB000', Menge: -1 }, 'muss 0 oder größer sein'],
    [{ LM_Zutat: 'AFB000', Menge: MENGE_MAX + 1 }, `darf höchstens ${MENGE_MAX} sein`],
  ])('rejects Menge %j (DECISIONS #87: negative values never reach the DB)', (body, issue) => {
    expect(detailsOf(parseAddIngredientBody, body)).toEqual([{ field: 'Menge', issue }]);
  });

  it('accepts Menge = MENGE_MAX and rejects confirmDuplicate that is not a boolean', () => {
    expect(parseAddIngredientBody({ LM_Zutat: 'AFB000', Menge: MENGE_MAX }).Menge).toBe(MENGE_MAX);
    for (const bad of ['true', 1, 'ja']) {
      expect(detailsOf(parseAddIngredientBody, { LM_Zutat: 'AFB000', Menge: 1, confirmDuplicate: bad })).toEqual([
        { field: 'confirmDuplicate', issue: 'muss true oder false sein' },
      ]);
    }
  });

  it('collects every violation in one response', () => {
    expect(detailsOf(parseAddIngredientBody, { LM_Zutat: 'x', Menge: -1, confirmDuplicate: 'x' }).map((d) => d.field)).toEqual([
      'LM_Zutat', 'Menge', 'confirmDuplicate',
    ]);
  });

  it('rejects a body that is not an object (undefined, array, string)', () => {
    for (const body of [undefined, null, [{ LM_Zutat: 'AFB000', Menge: 1 }], 'LM_Zutat=AFB000']) {
      expect(detailsOf(parseAddIngredientBody, body)).toEqual([{ field: 'body', issue: 'muss ein JSON-Objekt sein' }]);
    }
  });
});

describe('parseUpdateIngredientBody (#8)', () => {
  it('returns only { Menge }; LM_Zutat/LMC in the body are ignored, not an error', () => {
    expect(parseUpdateIngredientBody({ Menge: 25, LM_Zutat: 'X', LMC: 'Y' })).toEqual({ Menge: 25 });
    expect(parseUpdateIngredientBody({ Menge: 0 })).toEqual({ Menge: 0 });
  });

  it.each([
    [{}, 'darf nicht leer sein'],
    [{ Menge: '25' }, 'muss eine Zahl sein'],
    [{ Menge: -5 }, 'muss 0 oder größer sein'],
    [{ Menge: Number.POSITIVE_INFINITY }, 'muss eine Zahl sein'],
  ])('rejects %j', (body, issue) => {
    expect(detailsOf(parseUpdateIngredientBody, body)).toEqual([{ field: 'Menge', issue }]);
  });

  it('rejects a body that is not an object', () => {
    expect(detailsOf(parseUpdateIngredientBody, [25])).toEqual([{ field: 'body', issue: 'muss ein JSON-Objekt sein' }]);
  });
});
