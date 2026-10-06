import { describe, it, expect } from 'vitest';
import { MENGE_SUM_TOLERANCE, isZusatz, summarizeIngredients } from './ingredients.js';

const row = (id, Menge, itemart) => ({
  id, LMC: 'P00001', LM_Zutat: `Z${id}`, Menge, Version: 3, Anrcode: 0,
  zutat: itemart === null ? null : { lebtab_Bezeich: `Zutat ${id}`, lebtab_Itemart: itemart },
});

describe('isZusatz', () => {
  it('is true only for a known ingredient with Itemart A', () => {
    expect(isZusatz(row(1, 5, 'A'))).toBe(true);
    expect(isZusatz(row(2, 5, 'L'))).toBe(false);
    expect(isZusatz(row(3, 5, null))).toBe(false);
  });
});

describe('summarizeIngredients', () => {
  it('excludes A rows from the sum, keeps unknown rows in it, hides Menge = 0', () => {
    const rows = [row(1, 60, 'L'), row(2, 40, null), row(3, 210, 'A'), row(4, 0, 'L'), row(5, 0, 'A')];
    const s = summarizeIngredients(rows);
    expect(s.visibleRows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(s.hiddenZeroCount).toBe(2);
    expect(s.sum).toBe(100);
    expect(s.sumOk).toBe(true);
  });

  it('uses the tolerance 0.05 inclusively', () => {
    expect(MENGE_SUM_TOLERANCE).toBe(0.05);
    expect(summarizeIngredients([row(1, 100.05, 'L')]).sumOk).toBe(true);
    expect(summarizeIngredients([row(1, 99.95, 'L')]).sumOk).toBe(true);
    expect(summarizeIngredients([row(1, 100.06, 'L')]).sumOk).toBe(false);
    expect(summarizeIngredients([row(1, 80, 'L')]).sumOk).toBe(false);
  });

  it('does NOT round: float noise stays visible in sum but does not flip sumOk (DECISIONS #58)', () => {
    const s = summarizeIngredients([row(1, 0.1, 'L'), row(2, 0.2, 'L'), row(3, 99.7, 'L')]);
    expect(s.sum).toBe(0.1 + 0.2 + 99.7);
    expect(s.sumOk).toBe(true);
  });

  it('handles an empty recipe', () => {
    expect(summarizeIngredients([])).toEqual({ visibleRows: [], hiddenZeroCount: 0, sum: 0, sumOk: false });
  });
});
