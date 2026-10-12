import { describe, it, expect } from 'vitest';
import { recipeFingerprint } from './recipeFingerprint.js';

const ROWS = [
  { id: 7, LM_Zutat: 'QBP000', Menge: 1.2 },
  { id: 3, LM_Zutat: 'FDC000', Menge: 11 },
];

describe('recipeFingerprint', () => {
  it('is 40 lower-case hex characters and independent of row order', () => {
    const value = recipeFingerprint(ROWS);
    expect(value).toMatch(/^[0-9a-f]{40}$/);
    expect(recipeFingerprint([...ROWS].reverse())).toBe(value);
  });

  it('changes when a row is added, removed, or its Menge / code changes', () => {
    const base = recipeFingerprint(ROWS);
    expect(recipeFingerprint([...ROWS, { id: 9, LM_Zutat: 'OHB000', Menge: 0 }])).not.toBe(base);
    expect(recipeFingerprint(ROWS.slice(1))).not.toBe(base);
    expect(recipeFingerprint([{ ...ROWS[0], Menge: 1.3 }, ROWS[1]])).not.toBe(base);
    expect(recipeFingerprint([{ ...ROWS[0], LM_Zutat: 'QBK000' }, ROWS[1]])).not.toBe(base);
  });

  it('a deleted row re-added with a new id counts as a change', () => {
    expect(recipeFingerprint([{ ...ROWS[0], id: 8 }, ROWS[1]])).not.toBe(recipeFingerprint(ROWS));
  });

  it('empty recipe has a stable value', () => {
    // SHA-1 des leeren Strings — faellt auf, wenn sich das Verfahren aendert
    expect(recipeFingerprint([])).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('ignores the joined zutat object and other keys (IngredientRow from #2 can be passed directly)', () => {
    const withExtra = ROWS.map((row) => ({ ...row, LMC: 'DQCO00', Version: 3, Anrcode: 0, zutat: null }));
    expect(recipeFingerprint(withExtra)).toBe(recipeFingerprint(ROWS));
  });
});
