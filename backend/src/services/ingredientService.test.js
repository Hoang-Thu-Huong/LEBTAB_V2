import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../models/lebtabModel.js', () => ({ findStoredLmcs: vi.fn() }));
import * as lebtabModel from '../models/lebtabModel.js';
import { validateIngredientRefs, NEW_ROW_VERSION, NEW_ROW_ANRCODE } from './ingredientService.js';

const CONN = { tag: 'conn' };
beforeEach(() => vi.clearAllMocks());

describe('ingredientService.validateIngredientRefs', () => {
  it('resolves every code with ONE query and returns rows with the DB spelling (collation _ci)', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue(['A1A100', 'JVB100']);
    const rows = await validateIngredientRefs([{ LM_Zutat: 'a1a100', Menge: 10 }, { LM_Zutat: 'JVB100', Menge: 0 }], CONN);
    expect(lebtabModel.findStoredLmcs).toHaveBeenCalledTimes(1);
    expect(lebtabModel.findStoredLmcs).toHaveBeenCalledWith(['a1a100', 'JVB100'], CONN);
    expect(rows).toEqual([{ LM_Zutat: 'A1A100', Menge: 10 }, { LM_Zutat: 'JVB100', Menge: 0 }]);
  });

  it('a row with Menge 0 must exist too; the first missing code is the message', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue(['JVB100']);
    await expect(validateIngredientRefs([{ LM_Zutat: 'X00000', Menge: 0 }, { LM_Zutat: 'JVB100', Menge: 1 }], CONN)).rejects.toMatchObject({
      status: 400, code: 'INGREDIENT_NOT_FOUND', message: 'Zutat X00000 existiert nicht',
      details: [{ field: 'ingredients[0].LM_Zutat', issue: 'Zutat X00000 existiert nicht' }],
    });
  });

  it('lists every missing code in details (not only the first)', async () => {
    lebtabModel.findStoredLmcs.mockResolvedValue([]);
    await expect(validateIngredientRefs([{ LM_Zutat: 'X00001', Menge: 1 }, { LM_Zutat: 'X00002', Menge: 1 }], CONN)).rejects.toMatchObject({
      details: [
        { field: 'ingredients[0].LM_Zutat', issue: 'Zutat X00001 existiert nicht' },
        { field: 'ingredients[1].LM_Zutat', issue: 'Zutat X00002 existiert nicht' },
      ],
    });
  });

  it('empty list -> [] without a query', async () => {
    expect(await validateIngredientRefs([], CONN)).toEqual([]);
    expect(lebtabModel.findStoredLmcs).not.toHaveBeenCalled();
  });

  it('new rows get Version 0 and Anrcode 0 (DECISIONS #42, #90)', () => {
    expect(NEW_ROW_VERSION).toBe(0);
    expect(NEW_ROW_ANRCODE).toBe(0);
  });

  it('never imports nutritionService (SPEC 5.2, ARCH 8.3 #6)', () => {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ingredientService.js');
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/import[^;]*nutritionService/);
  });
});
