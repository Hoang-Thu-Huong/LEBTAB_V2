import { describe, it, expect } from 'vitest';
import { changedValues, recalcDialogContent, recalcSuccessText } from './recalcPreview.js';

const FIELDS = [
  { key: 'lebtab_EW', label: 'EW', unit: 'g' },
  { key: 'lebtab_H2O', label: 'H2O', unit: null },
  { key: 'lebtab_JOD', label: 'JOD', unit: 'µg' },
];
const zutat = (name, itemart = 'L') => ({ lebtab_Bezeich: name, lebtab_Itemart: itemart });
const row = (id, code, menge, z) => ({ id, LM_Zutat: code, Menge: menge, zutat: z });

/** Echtes Beispiel A1DP00 (Fruchtzwerge): 3 Zusaetze wirken, JPTI00 mit Menge 0 nicht (Entscheidung 08/10/2026). */
const A1DP00 = [
  row(1, '170000', 0, zutat('Aromastoffe')),
  row(2, 'BAF000', 50, zutat('Speisequark')),
  row(3, 'BAG000', 50, zutat('Quark 10%')),
  row(4, 'JCA000', 180, zutat('Calcium (1=1mg)', 'A')),
  row(5, 'JPRO00', 6.3, zutat('Protein,gesamt (1=1g)', 'A')),
  row(6, 'JPTI00', 0, zutat('Protein,tierisch (1=1g)', 'A')),
];

function preview(overrides = {}) {
  return {
    lmc: 'DQCO00',
    current: { lebtab_EW: 1, lebtab_H2O: 63.1, lebtab_JOD: 3.82726666666667 },
    nutrition: { lebtab_EW: 1, lebtab_H2O: 63.1 + 1e-12, lebtab_JOD: 25.675666666666665 },
    contributingRows: 2,
    warnings: [],
    ingredients: [row(1, 'QBP000', 1.2, zutat('Meersalz')), row(2, 'LAA000', 98.8, zutat('Aubergine'))],
    recipeVersion: 'a'.repeat(40),
    _row_version: 4,
    ...overrides,
  };
}

describe('changedValues', () => {
  it('lists only changed columns in field order; differences <= 1e-9 count as unchanged', () => {
    const p = preview();
    expect(changedValues(p.current, p.nutrition, FIELDS)).toEqual([
      { key: 'lebtab_JOD', label: 'JOD', unit: 'µg', before: 3.82726666666667, after: 25.675666666666665 },
    ]);
  });

  it('null vs number is a change; null vs null is not', () => {
    const res = changedValues({ lebtab_EW: null, lebtab_H2O: null, lebtab_JOD: 2 }, { lebtab_EW: 0, lebtab_H2O: null, lebtab_JOD: null }, FIELDS);
    expect(res.map((c) => [c.key, c.before, c.after])).toEqual([['lebtab_EW', null, 0], ['lebtab_JOD', 2, null]]);
  });
});

describe('recalcDialogContent (SPEC 5.9 + Entscheidungen 08/10/2026)', () => {
  it('Aubergine: "1 von 79 Werten ändert sich", table bisher -> neu with unit, sum 100 g, overwrite warning', () => {
    const c = recalcDialogContent(preview(), FIELDS);
    expect(c.title).toBe('Nährwerte neu berechnen?');
    expect(c.confirmLabel).toBe('Speichern');
    expect(c.lines).toEqual(['1 von 79 Werten ändert sich:']);
    expect(c.table).toEqual({ head: ['Wert', 'bisher', 'neu'], rows: [['JOD', '3.82726666666667 µg', '25.675666666666665 µg']] });
    expect(c.notes[0]).toBe('Summe der Zutaten: 100 g');
    expect(c.notes.at(-1)).toBe('Die bisherigen Werte werden überschrieben und können nicht wiederhergestellt werden.');
  });

  it('no change -> no table, "Keiner der 79 Werte ändert sich."', () => {
    const p = preview({ nutrition: { lebtab_EW: 1, lebtab_H2O: 63.1, lebtab_JOD: 3.82726666666667 } });
    const c = recalcDialogContent(p, FIELDS);
    expect(c.table).toBeNull();
    expect(c.lines).toEqual(['Keiner der 79 Werte ändert sich.']);
  });

  it('A1DP00: Zusatz with Menge 0 is listed under "Übersprungen", the Zusatz sentence counts only Menge > 0', () => {
    const c = recalcDialogContent(preview({ ingredients: A1DP00 }), FIELDS);
    const i = c.notes.indexOf('Übersprungen (fließen nicht ein):');
    expect(c.notes.slice(i + 1, i + 3)).toEqual(['• 170000 – Aromastoffe — Menge 0', '• JPTI00 – Protein,tierisch (1=1g) (Zusatz) — Menge 0']);
    const j = c.notes.indexOf('2 Zusätze ersetzen die berechneten Werte:');
    expect(c.notes.slice(j + 1, j + 3)).toEqual(['• JCA000 – Calcium (1=1mg) — 180', '• JPRO00 – Protein,gesamt (1=1g) — 6.3']);
    expect(c.notes.join('\n')).not.toContain('JPTI00 – Protein,tierisch (1=1g) — 0');
  });

  it('unknown code and Zusatz without marker are skipped too', () => {
    const ingredients = [row(1, 'XXX999', 5, null), row(2, 'LAA000', 95, zutat('A')), row(3, 'JJJJ00', 1, zutat('Dummy', 'A'))];
    const warnings = [{ reason: 'NOT_FOUND_IN_LEBTAB', LM_Zutat: 'XXX999' }, { reason: 'A_MARKER_EMPTY', LM_Zutat: 'JJJJ00' }];
    const c = recalcDialogContent(preview({ ingredients, warnings }), FIELDS);
    expect(c.notes).toContain('• XXX999 – unbekannt — Code nicht in der Datenbank');
    expect(c.notes).toContain('• JJJJ00 (Zusatz) — ohne Wirkung (kein Nährwert markiert)');
    expect(c.notes).toContain('1 Zusatz ersetzt die berechneten Werte:');
  });

  it('red lines: sum != 100 g, n-fold duplicated recipe, nothing contributes, notice from RECIPE_CHANGED first', () => {
    const p = preview({
      ingredients: [row(1, 'LAA000', 80, zutat('A'))],
      warnings: [{ reason: 'RECIPE_DUPLICATED', faktor: 2 }],
      contributingRows: 0,
    });
    const c = recalcDialogContent(p, FIELDS, 'Die Rezeptur wurde inzwischen geändert – bitte die Vorschau erneut prüfen');
    expect(c.lines[0]).toEqual({ text: 'Die Rezeptur wurde inzwischen geändert – bitte die Vorschau erneut prüfen', warn: true });
    expect(c.lines[1]).toEqual({ text: 'Keine Zutat fließt ein — alle 79 Werte werden geleert.', warn: true });
    expect(c.notes).toContain('Summe der Zutaten: 80 g');
    expect(c.notes).toContainEqual({ text: '≠ 100 g — die Nährwerte beziehen sich dann nicht auf 100 g', warn: true });
    expect(c.notes).toContainEqual({ text: 'Rezeptur ist 2-fach dupliziert — Ergebnis wird 2-fach zu hoch', warn: true });
  });

  it('values without unit and null are shown like the nutrition table ("–")', () => {
    const p = preview({ current: { lebtab_EW: 1, lebtab_H2O: null, lebtab_JOD: 1 }, nutrition: { lebtab_EW: 1, lebtab_H2O: 2.5, lebtab_JOD: 1 } });
    expect(recalcDialogContent(p, FIELDS).table.rows).toEqual([['H2O', '–', '2.5']]);
  });
});

describe('recalcSuccessText', () => {
  it('names the number of changed values', () => {
    expect(recalcSuccessText(2)).toBe('Nährwerte neu berechnet und gespeichert — 2 von 79 Werten geändert.');
    expect(recalcSuccessText(0)).toBe('Nährwerte neu berechnet und gespeichert — keine Werte geändert.');
  });
});
