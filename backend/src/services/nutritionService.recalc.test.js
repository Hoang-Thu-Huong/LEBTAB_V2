import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 8: recalculateNutrition — eigene Datei, weil hier zusaetzlich czutabModel und updateNutrition gemockt werden.
vi.mock('../models/lebtabModel.js', () => ({ findNutritionByLmcs: vi.fn(), updateNutrition: vi.fn() }));
vi.mock('../models/czutabModel.js', () => ({ lockByLmc: vi.fn(), findByLmcWithZutat: vi.fn() }));

import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { recipeFingerprint } from '../utils/recipeFingerprint.js';
import { recalculateNutrition } from './nutritionService.js';

const CONN = { tag: 'tx' };

function ref(lmc, itemart, value) {
  const row = { lebtab_lmc: lmc, lebtab_Itemart: itemart };
  for (const column of NUTRITION_COLUMNS) row[column] = value;
  return row;
}
const RECIPE = [
  { id: 11, LMC: 'DQCO00', LM_Zutat: 'FDC000', Menge: 40, Version: 3, Anrcode: 0, zutat: { lebtab_Bezeich: 'Öl', lebtab_Itemart: 'L' } },
  { id: 12, LMC: 'DQCO00', LM_Zutat: 'LAA000', Menge: 60, Version: 3, Anrcode: 0, zutat: { lebtab_Bezeich: 'X', lebtab_Itemart: 'L' } },
];

let calls;
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  czutabModel.lockByLmc.mockImplementation(async () => { calls.push('lock c_zutab'); return 2; });
  czutabModel.findByLmcWithZutat.mockImplementation(async () => { calls.push('read c_zutab'); return RECIPE; });
  lebtabModel.findNutritionByLmcs.mockImplementation(async () => { calls.push('refs'); return [ref('FDC000', 'L', 10), ref('LAA000', 'L', 20)]; });
  lebtabModel.updateNutrition.mockImplementation(async () => { calls.push('update lebtab'); return 1; });
});

describe('nutritionService.recalculateNutrition (SPEC 5.2, #6)', () => {
  it('locks c_zutab, reads the recipe, calculates, then writes lebtab — in this order, all on the transaction conn', async () => {
    const res = await recalculateNutrition('DQCO00', 5, CONN);
    expect(calls).toEqual(['lock c_zutab', 'read c_zutab', 'refs', 'update lebtab']);
    expect(czutabModel.lockByLmc).toHaveBeenCalledWith('DQCO00', CONN);
    expect(czutabModel.findByLmcWithZutat).toHaveBeenCalledWith('DQCO00', CONN);
    expect(lebtabModel.findNutritionByLmcs.mock.calls[0][1]).toBe(CONN);
    expect(lebtabModel.updateNutrition).toHaveBeenCalledWith('DQCO00', res.nutrition, 5, CONN);
    // 40 x 10 / 100 + 60 x 20 / 100 = 16
    expect(res.nutrition[NUTRITION_COLUMNS[0]]).toBe(16);
    expect(res).toMatchObject({ contributingRows: 2, warnings: [], ingredients: RECIPE, updated: true });
  });

  it('updated: false when the UPDATE matched no row (version changed or product gone) — no throw here', async () => {
    lebtabModel.updateNutrition.mockResolvedValue(0);
    expect((await recalculateNutrition('DQCO00', 5, CONN)).updated).toBe(false);
  });

  it('recipeVersion from the preview: equal -> writes; different -> 409 RECIPE_CHANGED before any write', async () => {
    await recalculateNutrition('DQCO00', 5, CONN, { recipeVersion: recipeFingerprint(RECIPE) });
    expect(lebtabModel.updateNutrition).toHaveBeenCalledTimes(1);

    await expect(recalculateNutrition('DQCO00', 5, CONN, { recipeVersion: 'f'.repeat(40) })).rejects.toMatchObject({
      status: 409,
      code: 'RECIPE_CHANGED',
    });
    expect(lebtabModel.updateNutrition).toHaveBeenCalledTimes(1);
  });

  it('recipeVersion null = not checked', async () => {
    await recalculateNutrition('DQCO00', 5, CONN, { recipeVersion: null });
    expect(lebtabModel.updateNutrition).toHaveBeenCalledTimes(1);
  });

  it('empty recipe -> all 79 values null are written (never 0, SPEC 5.1 contributingRows === 0)', async () => {
    czutabModel.findByLmcWithZutat.mockResolvedValue([]);
    const res = await recalculateNutrition('DQCO00', 5, CONN);
    expect(res.contributingRows).toBe(0);
    expect(Object.values(lebtabModel.updateNutrition.mock.calls[0][1]).every((value) => value === null)).toBe(true);
  });
});
