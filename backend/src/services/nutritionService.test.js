import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../models/lebtabModel.js', () => ({ findNutritionByLmcs: vi.fn() }));

import * as lebtabModel from '../models/lebtabModel.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { calculateNutrition } from './nutritionService.js';

const CONN = { tag: 'conn' };

/** lebtab-Zeile wie von findNutritionByLmcs: Code, Itemart, 79 Spalten. Nicht genannte Spalten = 0. */
function ref(lmc, itemart, values = {}) {
  const row = { lebtab_lmc: lmc, lebtab_Itemart: itemart };
  for (const column of NUTRITION_COLUMNS) row[column] = 0;
  for (const [short, value] of Object.entries(values)) {
    const column = `lebtab_${short}`;
    if (!NUTRITION_COLUMNS.includes(column)) throw new Error(`unknown column in fixture: ${column}`);
    row[column] = value;
  }
  return row;
}

/** Der Mock liefert wie die DB nur die angefragten Codes (Kollation _ci: ohne Beachtung der Gross-/Kleinschreibung). */
function givenLebtab(...rows) {
  lebtabModel.findNutritionByLmcs.mockImplementation(async (lmcs) => {
    const wanted = new Set(lmcs.map((code) => code.toLowerCase()));
    return rows.filter((row) => wanted.has(row.lebtab_lmc.toLowerCase()));
  });
}

const allNull = () => Object.fromEntries(NUTRITION_COLUMNS.map((column) => [column, null]));

beforeEach(() => {
  vi.resetAllMocks();
  givenLebtab();
});

describe('calculateNutrition — step 1: regular ingredients (SPEC 5.1)', () => {
  it('sums Menge x value / 100 per column and returns exactly the 79 keys in order', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10, FETT: 2 }), ref('BBB000', 'L', { EW: 4, KH: 50 }));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'AAA000', Menge: 60 }, { LM_Zutat: 'BBB000', Menge: 40 }],
      CONN,
    );
    expect(Object.keys(result.nutrition)).toEqual([...NUTRITION_COLUMNS]);
    expect(result.nutrition.lebtab_EW).toBeCloseTo(7.6, 9);
    expect(result.nutrition.lebtab_FETT).toBeCloseTo(1.2, 9);
    expect(result.nutrition.lebtab_KH).toBeCloseTo(20, 9);
    expect(result.nutrition.lebtab_ALKO).toBe(0);
    expect(result.contributingRows).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it('does not normalise when the sum of Menge is not 100', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }));
    const result = await calculateNutrition([{ LM_Zutat: 'AAA000', Menge: 80 }], CONN);
    expect(result.nutrition.lebtab_EW).toBe(8);
  });

  it('counts two rows with the same LM_Zutat twice', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'AAA000', Menge: 30 }, { LM_Zutat: 'AAA000', Menge: 20 }],
      CONN,
    );
    expect(result.nutrition.lebtab_EW).toBe(5);
    expect(result.contributingRows).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it('treats NULL in an ingredient column as 0 (DECISIONS #74)', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: null, JOD: null }), ref('BBB000', 'L', { EW: 10, JOD: null }));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'AAA000', Menge: 50 }, { LM_Zutat: 'BBB000', Menge: 50 }],
      CONN,
    );
    expect(result.nutrition.lebtab_EW).toBe(5);
    expect(result.nutrition.lebtab_JOD).toBe(0);
  });

  it('loads all references with exactly one query for the distinct codes (no N+1)', async () => {
    givenLebtab(ref('AAA000', 'L'), ref('BBB000', 'L'));
    await calculateNutrition(
      [
        { LM_Zutat: 'AAA000', Menge: 10 },
        { LM_Zutat: 'BBB000', Menge: 20 },
        { LM_Zutat: 'AAA000', Menge: 30 },
      ],
      CONN,
    );
    expect(lebtabModel.findNutritionByLmcs).toHaveBeenCalledTimes(1);
    expect(lebtabModel.findNutritionByLmcs).toHaveBeenCalledWith(['AAA000', 'BBB000'], CONN);
  });

  it('matches codes case-insensitively like the _ci collation (DECISIONS #76)', async () => {
    givenLebtab(ref('AFB000', 'L', { EW: 3.55 }));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'afb000', Menge: 60 }, { LM_Zutat: 'AFB000', Menge: 40 }],
      CONN,
    );
    expect(result.nutrition.lebtab_EW).toBeCloseTo(3.55, 9);
    expect(result.contributingRows).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(lebtabModel.findNutritionByLmcs).toHaveBeenCalledWith(['afb000'], CONN);
  });
});

describe('calculateNutrition — step 2: A rows override by marker (DECISIONS #46)', () => {
  it('replaces step 1 at the marker column with Menge x marker, without dividing by 100', async () => {
    givenLebtab(ref('AAA000', 'L', { V_B1: 35, EW: 10 }), ref('JVB100', 'A', { V_B1: 1 }));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'AAA000', Menge: 100 }, { LM_Zutat: 'JVB100', Menge: 210 }],
      CONN,
    );
    expect(result.nutrition.lebtab_V_B1).toBe(210);
    expect(result.nutrition.lebtab_EW).toBe(10);
    expect(result.contributingRows).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it('applies markers other than 1 and codes that write two columns', async () => {
    givenLebtab(
      ref('JB1300', 'A', { V_B1: 1000 }),
      ref('JFOL00', 'A', { FOL_EQ: 1.7 }),
      ref('JCA200', 'A', { v_A: 167, CAROT: 1000 }),
    );
    const result = await calculateNutrition(
      [
        { LM_Zutat: 'JB1300', Menge: 0.5 },
        { LM_Zutat: 'JFOL00', Menge: 100 },
        { LM_Zutat: 'JCA200', Menge: 2 },
      ],
      CONN,
    );
    expect(result.nutrition.lebtab_V_B1).toBe(500);
    expect(result.nutrition.lebtab_FOL_EQ).toBeCloseTo(170, 9);
    expect(result.nutrition.lebtab_v_A).toBe(334);
    expect(result.nutrition.lebtab_CAROT).toBe(2000);
  });

  it('sums two rows of the same A code and reports DUPLICATE_OVERRIDE with ids and Mengen (DECISIONS #47)', async () => {
    givenLebtab(ref('JCA000', 'A', { CALC: 1 }));
    const result = await calculateNutrition(
      [{ id: 412693, LM_Zutat: 'JCA000', Menge: 237 }, { id: 412694, LM_Zutat: 'JCA000', Menge: 267 }],
      CONN,
    );
    expect(result.nutrition.lebtab_CALC).toBe(504);
    expect(result.contributingRows).toBe(2);
    expect(result.warnings).toEqual([
      { reason: 'DUPLICATE_OVERRIDE', LM_Zutat: 'JCA000', ids: [412693, 412694], Mengen: [237, 267] },
    ]);
  });

  it('reports ids as null when the rows carry no id (payload of a new product)', async () => {
    givenLebtab(ref('JPAN00', 'A', { PANTO: 1 }));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'JPAN00', Menge: 4 }, { LM_Zutat: 'JPAN00', Menge: 4 }],
      CONN,
    );
    expect(result.nutrition.lebtab_PANTO).toBe(8);
    expect(result.warnings).toEqual([
      { reason: 'DUPLICATE_OVERRIDE', LM_Zutat: 'JPAN00', ids: [null, null], Mengen: [4, 4] },
    ]);
  });

  it('sums two DIFFERENT A codes on the same column without a warning (DECISIONS #78, P1BK00)', async () => {
    givenLebtab(ref('JCA200', 'A', { v_A: 167, CAROT: 1000 }), ref('JVA000', 'A', { v_A: 1 }));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'JCA200', Menge: 14.4 }, { LM_Zutat: 'JVA000', Menge: 2400 }],
      CONN,
    );
    expect(result.nutrition.lebtab_v_A).toBeCloseTo(4804.8, 9);
    expect(result.nutrition.lebtab_CAROT).toBeCloseTo(14400, 9);
    expect(result.warnings).toEqual([]);
  });

  it('skips an A code without any marker (0 or NULL) and reports A_MARKER_EMPTY once', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }), ref('JJJJ00', 'A', { V_C: null }));
    const result = await calculateNutrition(
      [
        { LM_Zutat: 'AAA000', Menge: 100 },
        { LM_Zutat: 'JJJJ00', Menge: 5 },
        { LM_Zutat: 'JJJJ00', Menge: 7 },
      ],
      CONN,
    );
    expect(result.nutrition.lebtab_EW).toBe(10);
    expect(result.nutrition.lebtab_V_C).toBe(0);
    expect(result.contributingRows).toBe(1);
    expect(result.warnings).toEqual([{ reason: 'A_MARKER_EMPTY', LM_Zutat: 'JJJJ00' }]);
  });

  it('leaves all non-marker columns NULL when only A rows contribute', async () => {
    givenLebtab(ref('JVB100', 'A', { V_B1: 1 }));
    const result = await calculateNutrition([{ LM_Zutat: 'JVB100', Menge: 210 }], CONN);
    expect(result.nutrition).toEqual({ ...allNull(), lebtab_V_B1: 210 });
    expect(result.contributingRows).toBe(1);
  });
});

describe('calculateNutrition — rows that do not take part', () => {
  it('ignores Menge = 0 rows completely: no lookup, no warning, not counted (DECISIONS #48, #77)', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }), ref('JVB100', 'A', { V_B1: 1 }));
    const result = await calculateNutrition(
      [
        { LM_Zutat: 'AAA000', Menge: 100 },
        { LM_Zutat: 'ZZZ999', Menge: 0 },
        { LM_Zutat: 'JVB100', Menge: 0 },
      ],
      CONN,
    );
    expect(lebtabModel.findNutritionByLmcs).toHaveBeenCalledWith(['AAA000'], CONN);
    expect(result.nutrition.lebtab_EW).toBe(10);
    expect(result.nutrition.lebtab_V_B1).toBe(0);
    expect(result.contributingRows).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('ignores rows whose Menge is negative or not a finite number', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }));
    const result = await calculateNutrition(
      [
        { LM_Zutat: 'AAA000', Menge: -5 },
        { LM_Zutat: 'AAA000', Menge: Number.NaN },
        { LM_Zutat: 'AAA000', Menge: '10' },
        { LM_Zutat: 'AAA000' },
      ],
      CONN,
    );
    expect(result.nutrition).toEqual(allNull());
    expect(result.contributingRows).toBe(0);
  });

  it('reports an unknown LM_Zutat once as NOT_FOUND_IN_LEBTAB and keeps calculating', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }));
    const result = await calculateNutrition(
      [
        { LM_Zutat: 'AAA000', Menge: 50 },
        { LM_Zutat: 'XXX111', Menge: 30 },
        { LM_Zutat: 'xxx111', Menge: 20 },
      ],
      CONN,
    );
    expect(result.nutrition.lebtab_EW).toBe(5);
    expect(result.contributingRows).toBe(1);
    expect(result.warnings).toEqual([{ reason: 'NOT_FOUND_IN_LEBTAB', LM_Zutat: 'XXX111' }]);
  });
});

describe('calculateNutrition — contributingRows === 0 gives 79 x NULL, never 0', () => {
  it('for an empty recipe', async () => {
    const result = await calculateNutrition([], CONN);
    expect(result).toEqual({ nutrition: allNull(), warnings: [], contributingRows: 0 });
    expect(lebtabModel.findNutritionByLmcs).toHaveBeenCalledWith([], CONN);
  });

  it('when every row has Menge = 0', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'AAA000', Menge: 0 }, { LM_Zutat: 'BBB000', Menge: 0 }],
      CONN,
    );
    expect(result).toEqual({ nutrition: allNull(), warnings: [], contributingRows: 0 });
  });

  it('when no LM_Zutat exists in lebtab', async () => {
    const result = await calculateNutrition(
      [{ LM_Zutat: 'XXX111', Menge: 60 }, { LM_Zutat: 'YYY222', Menge: 40 }],
      CONN,
    );
    expect(result.nutrition).toEqual(allNull());
    expect(result.contributingRows).toBe(0);
    expect(result.warnings).toEqual([
      { reason: 'NOT_FOUND_IN_LEBTAB', LM_Zutat: 'XXX111' },
      { reason: 'NOT_FOUND_IN_LEBTAB', LM_Zutat: 'YYY222' },
    ]);
  });

  it('when only A codes without marker remain', async () => {
    givenLebtab(ref('JJJJ00', 'A'));
    const result = await calculateNutrition([{ LM_Zutat: 'JJJJ00', Menge: 3 }], CONN);
    expect(result.nutrition).toEqual(allNull());
    expect(result.contributingRows).toBe(0);
    expect(result.warnings).toEqual([{ reason: 'A_MARKER_EMPTY', LM_Zutat: 'JJJJ00' }]);
  });
});

describe('calculateNutrition — RECIPE_DUPLICATED (DECISIONS #49)', () => {
  const twice = (rows) => [...rows, ...rows];

  it('reports the factor when every (LM_Zutat, Menge) pair occurs exactly n times and does not correct the result', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }), ref('BBB000', 'L', { EW: 4 }));
    const recipe = [{ LM_Zutat: 'AAA000', Menge: 60 }, { LM_Zutat: 'BBB000', Menge: 40 }];
    const result = await calculateNutrition(twice(recipe), CONN);
    expect(result.nutrition.lebtab_EW).toBeCloseTo(15.2, 9);
    expect(result.contributingRows).toBe(4);
    expect(result.warnings).toEqual([{ reason: 'RECIPE_DUPLICATED', faktor: 2 }]);
  });

  it('reports factor 3 and also counts Menge = 0 rows and unknown codes as pairs', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }));
    const recipe = [{ LM_Zutat: 'AAA000', Menge: 100 }, { LM_Zutat: 'ZZZ999', Menge: 0 }];
    const result = await calculateNutrition([...recipe, ...recipe, ...recipe], CONN);
    expect(result.warnings).toEqual([{ reason: 'RECIPE_DUPLICATED', faktor: 3 }]);
  });

  it('does not report when the pairs repeat unevenly', async () => {
    givenLebtab(ref('AAA000', 'L'), ref('BBB000', 'L'));
    const result = await calculateNutrition(
      [
        { LM_Zutat: 'AAA000', Menge: 60 },
        { LM_Zutat: 'AAA000', Menge: 60 },
        { LM_Zutat: 'BBB000', Menge: 40 },
      ],
      CONN,
    );
    expect(result.warnings).toEqual([]);
  });

  it('does not report a recipe that consists of one single repeated pair', async () => {
    givenLebtab(ref('AAA000', 'L'));
    const result = await calculateNutrition(
      [{ LM_Zutat: 'AAA000', Menge: 50 }, { LM_Zutat: 'AAA000', Menge: 50 }],
      CONN,
    );
    expect(result.warnings).toEqual([]);
  });

  it('returns DUPLICATE_OVERRIDE and RECIPE_DUPLICATED together for a duplicated recipe with A rows (DECISIONS #75)', async () => {
    givenLebtab(ref('AAA000', 'L', { EW: 10 }), ref('JCA000', 'A', { CALC: 1 }));
    const recipe = [{ LM_Zutat: 'AAA000', Menge: 100 }, { LM_Zutat: 'JCA000', Menge: 120 }];
    const result = await calculateNutrition(twice(recipe), CONN);
    expect(result.nutrition.lebtab_CALC).toBe(240);
    expect(result.warnings).toEqual([
      { reason: 'DUPLICATE_OVERRIDE', LM_Zutat: 'JCA000', ids: [null, null], Mengen: [120, 120] },
      { reason: 'RECIPE_DUPLICATED', faktor: 2 },
    ]);
  });
});

describe('calculateNutrition — errors', () => {
  it('lets a database error propagate unchanged (errorHandler maps it to 503)', async () => {
    const dbError = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    lebtabModel.findNutritionByLmcs.mockRejectedValue(dbError);
    await expect(calculateNutrition([{ LM_Zutat: 'AAA000', Menge: 100 }], CONN)).rejects.toBe(dbError);
  });
});

describe('calculateNutrition — real fixture A1CK00', () => {
  // Quelle: lebtab_new, nur SELECT, 06/10/2026 (scripts/check-phase3.sql 4e + Naehrwerte der 15 beteiligten Codes).
  // Nur die hier genannten Spalten sind echt; alle anderen stehen im Fixture auf 0 und werden nicht geprueft.
  const RECIPE = [
    { id: 313114, LM_Zutat: '000200', Menge: 0 },
    { id: 313115, LM_Zutat: '033000', Menge: 0 },
    { id: 313116, LM_Zutat: '041000', Menge: 0.1 },
    { id: 313117, LM_Zutat: '140000', Menge: 2.8375721793267683 },
    { id: 313118, LM_Zutat: '170000', Menge: 0 },
    { id: 313119, LM_Zutat: 'AEG000', Menge: 2.559834838862169 },
    { id: 313120, LM_Zutat: 'AFB000', Menge: 67.3703820177439 },
    { id: 313121, LM_Zutat: 'JB1200', Menge: 0.2 },
    { id: 313122, LM_Zutat: 'JCA000', Menge: 120 },
    { id: 313123, LM_Zutat: 'JVB100', Menge: 210 },
    { id: 313124, LM_Zutat: 'JVB200', Menge: 240 },
    { id: 313125, LM_Zutat: 'JVB600', Menge: 300 },
    { id: 313126, LM_Zutat: 'NA5000', Menge: 4.415456881399181 },
    { id: 313127, LM_Zutat: 'NAM000', Menge: 3.580491425024408 },
    { id: 313128, LM_Zutat: 'NAQ000', Menge: 3.219836279505954 },
    { id: 313129, LM_Zutat: 'NAW000', Menge: 3.961739442087133 },
    { id: 313130, LM_Zutat: 'OFL000', Menge: 6.979967207301085 },
    { id: 313131, LM_Zutat: 'PAC000', Menge: 4.9747197287494105 },
  ];
  const LEBTAB = [
    ref('041000', 'L', { E_JOULE: 252, EW: 4.502, FETT: 1.4, KH: 7.3, V_C: 0, V_B1: 0, V_B2: 0, V_B6: 0, V_B12: 0, CALC: 670 }),
    ref('140000', 'L', { E_JOULE: 1471, EW: 0.431, FETT: 0.08, KH: 85.9, V_C: 0, V_B1: 0, V_B2: 8, V_B6: 5, V_B12: 0, CALC: 10 }),
    ref('AEG000', 'L', { E_JOULE: 1415, EW: 81.5, FETT: 0.801, KH: 0, V_C: 0, V_B1: 0, V_B2: 70, V_B6: 0, V_B12: 0.2, CALC: 100 }),
    ref('AFB000', 'L', { E_JOULE: 206, EW: 3.55, FETT: 1.601, KH: 4.49, V_C: 1.6, V_B1: 35, V_B2: 170, V_B6: 44, V_B12: 0.4, CALC: 114 }),
    ref('JB1200', 'A', { V_B12: 1 }),
    ref('JCA000', 'A', { CALC: 1 }),
    ref('JVB100', 'A', { V_B1: 1 }),
    ref('JVB200', 'A', { V_B2: 1 }),
    ref('JVB600', 'A', { V_B6: 1 }),
    ref('NA5000', 'L', { E_JOULE: 146, EW: 0.748, FETT: 0.324, KH: 6.394, V_C: 34.68, V_B1: 26, V_B2: 44, V_B6: 49, V_B12: 0, CALC: 20 }),
    ref('NAM000', 'L', { E_JOULE: 175, EW: 1.111, FETT: 0.823, KH: 7.165, V_C: 10.496, V_B1: 25, V_B2: 33, V_B6: 41, V_B12: 0, CALC: 45 }),
    ref('NAQ000', 'L', { E_JOULE: 214, EW: 2.02, FETT: 1.416, KH: 6.79, V_C: 26, V_B1: 30, V_B2: 60, V_B6: 90, V_B12: 0, CALC: 5 }),
    ref('NAW000', 'L', { E_JOULE: 237, EW: 0.3, FETT: 0.404, KH: 11.8, V_C: 7.269, V_B1: 40, V_B2: 48, V_B6: 40, V_B12: 0, CALC: 15 }),
    ref('OFL000', 'L', { E_JOULE: 1122, EW: 2.915, FETT: 1.065, KH: 58.062, V_C: 12.001, V_B1: 177, V_B2: 95, V_B6: 313, V_B12: 0, CALC: 59 }),
    ref('PAC000', 'L', { E_JOULE: 1697, EW: 0, FETT: 0, KH: 99.8, V_C: 0, V_B1: 0, V_B2: 0, V_B6: 0, V_B12: 0, CALC: 1 }),
  ];

  it('reproduces the stored values: macros by sum / 100, vitamins and calcium from the A rows', async () => {
    givenLebtab(...LEBTAB);
    const result = await calculateNutrition(RECIPE, CONN);
    // gespeicherte Werte von A1CK00 (lebtab), 06/10/2026
    expect(result.nutrition.lebtab_E_JOULE).toBeCloseTo(408.725761703669, 9);
    expect(result.nutrition.lebtab_EW).toBeCloseTo(4.84784472386547, 9);
    expect(result.nutrition.lebtab_FETT).toBeCloseTo(1.2824826354521, 9);
    expect(result.nutrition.lebtab_KH).toBeCloseTo(15.7121621649779, 9);
    expect(result.nutrition.lebtab_V_C).toBeCloseTo(4.94781707598877, 9);
    expect(result.nutrition.lebtab_V_B1).toBe(210);
    expect(result.nutrition.lebtab_V_B2).toBe(240);
    expect(result.nutrition.lebtab_V_B6).toBe(300);
    expect(result.nutrition.lebtab_V_B12).toBe(0.2);
    expect(result.nutrition.lebtab_CALC).toBe(120);
    expect(result.contributingRows).toBe(15);
    expect(result.warnings).toEqual([]);
    // die 3 Zeilen mit Menge = 0 werden nicht einmal nachgeschlagen
    expect(lebtabModel.findNutritionByLmcs.mock.calls[0][0]).toHaveLength(15);
  });
});
