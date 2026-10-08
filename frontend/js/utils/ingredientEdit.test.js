import { describe, it, expect } from 'vitest';
import {
  rowLabel,
  toEditorRows,
  splitIngredientResponse,
  deleteDialogLines,
  duplicateDialogLines,
  DELETE_HINT,
  DUPLICATE_QUESTION,
} from './ingredientEdit.js';

const known = { id: 7, LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25.5, Version: 3, Anrcode: 0, zutat: { lebtab_Bezeich: 'Joghurt', lebtab_Itemart: 'L' } };
const unknown = { id: 8, LMC: 'A1CK00', LM_Zutat: 'X99999', Menge: 0, Version: 2, Anrcode: 0, zutat: null };

describe('ingredientEdit helpers', () => {
  it('rowLabel: "CODE – Bezeichnung", unknown ingredient -> "CODE – unbekannt"', () => {
    expect(rowLabel(known)).toBe('AFB000 – Joghurt');
    expect(rowLabel(unknown)).toBe('X99999 – unbekannt');
  });

  it('toEditorRows keeps every field and adds mengeText = Menge as stored (no rounding, 0 stays "0")', () => {
    const rows = toEditorRows([known, { ...unknown, Menge: 99.99999999999999 }]);
    expect(rows[0]).toEqual({ ...known, mengeText: '25.5' });
    expect(rows[1].mengeText).toBe('99.99999999999999');
    expect(toEditorRows([unknown])[0].mengeText).toBe('0');
  });

  it('splitIngredientResponse separates lebtab_nutrition_stale from the IngredientRow', () => {
    expect(splitIngredientResponse({ ...known, lebtab_nutrition_stale: 1 })).toEqual({ row: known, stale: 1 });
  });

  it('deleteDialogLines: label, Menge, reminder that nutrition changes only after recalculation (SPEC 5.9)', () => {
    expect(deleteDialogLines(known)).toEqual(['AFB000 – Joghurt', 'Menge: 25.5 g', DELETE_HINT]);
    expect(deleteDialogLines(unknown)[0]).toBe('X99999 – unbekannt');
  });

  it('duplicateDialogLines lists every existing Menge (history may hold several rows of the pair)', () => {
    const pending = { LM_Zutat: 'AFB000', zutat: { lebtab_Bezeich: 'Joghurt', lebtab_Itemart: 'L' } };
    expect(duplicateDialogLines(pending, [{ id: 1, Menge: 25 }])).toEqual([
      'AFB000 – Joghurt ist bereits enthalten (Menge: 25 g).', DUPLICATE_QUESTION,
    ]);
    expect(duplicateDialogLines(pending, [{ id: 1, Menge: 25 }, { id: 9, Menge: 0.5 }])[0]).toBe(
      'AFB000 – Joghurt ist bereits 2-mal enthalten (Menge: 25 g, 0.5 g).',
    );
  });
});
