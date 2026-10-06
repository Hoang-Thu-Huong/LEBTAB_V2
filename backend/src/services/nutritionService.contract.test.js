import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../config/db.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { calculateNutrition } from './nutritionService.js';

const dbUp = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch((e) => {
    console.warn(`[contract] DB nicht erreichbar, DB-Tests uebersprungen: ${e.code ?? e.message}`);
    return false;
  });
afterAll(() => pool.end());

/** Golden-Test (docs/ARCHITECTURE.md 8.3 #4b, DECISIONS #73). */
const SAMPLE_SIZE = 50;
const MIN_MATCHING = 40;
const TOLERANCE = 1e-9;
/** ~600 Produkte speichern E_CAL nach Atwater statt als Summe (DECISIONS #45). */
const EXCLUDED_COLUMNS = new Set(['lebtab_E_CAL']);

// "Saubere" Produkte: existieren in lebtab, keine A-Zeile, kein unbekannter LM_Zutat, Summe Menge = 100 g,
// Rezeptur nicht dupliziert. Gleiche Kriterien wie scripts/check-golden.sql. Nur SELECT.
const CANDIDATES_SQL = `
  SELECT z.LMC AS lmc
    FROM c_zutab z
    JOIN lebtab p ON p.lebtab_lmc = z.LMC
    LEFT JOIN lebtab l ON l.lebtab_lmc = z.LM_Zutat
   WHERE z.LMC NOT IN (
           SELECT LMC FROM (
             SELECT LMC FROM (SELECT LMC, LM_Zutat, Menge, COUNT(*) AS n FROM c_zutab GROUP BY LMC, LM_Zutat, Menge) y
              GROUP BY LMC HAVING MIN(n) >= 2 AND MIN(n) = MAX(n)
           ) dup
         )
   GROUP BY z.LMC
  HAVING SUM(l.lebtab_lmc IS NULL) = 0 AND SUM(l.lebtab_Itemart = 'A') = 0 AND ABS(SUM(z.Menge) - 100) < 1e-9
   ORDER BY z.LMC
   LIMIT ${SAMPLE_SIZE}`;

function sameValue(stored, calculated) {
  if (stored === null || calculated === null) return stored === calculated;
  return Math.abs(stored - calculated) <= TOLERANCE;
}

describe.skipIf(!dbUp)('calculateNutrition vs. gespeicherte Naehrwerte (echte DB, nur SELECT)', () => {
  it(`reproduces all 78 compared columns for at least ${MIN_MATCHING} of ${SAMPLE_SIZE} clean products`, async () => {
    const [candidates] = await pool.query(CANDIDATES_SQL);
    expect(candidates).toHaveLength(SAMPLE_SIZE);

    const deviating = [];
    for (const { lmc } of candidates) {
      const [stored, recipe] = await Promise.all([
        lebtabModel.findByLmc(lmc, { technicalColumns: false }, pool),
        czutabModel.findByLmcWithZutat(lmc, pool),
      ]);
      const result = await calculateNutrition(recipe, pool);
      // saubere Rezeptur: nichts darf uebersprungen oder gemeldet werden
      expect(result.warnings, `warnings for ${lmc}`).toEqual([]);
      expect(result.contributingRows, `contributingRows for ${lmc}`).toBeGreaterThan(0);
      const columns = NUTRITION_COLUMNS.filter(
        (column) => !EXCLUDED_COLUMNS.has(column) && !sameValue(stored[column], result.nutrition[column]),
      );
      if (columns.length > 0) deviating.push(`${lmc} (${columns.length})`);
    }

    const matching = candidates.length - deviating.length;
    console.warn(`[golden] ${matching}/${candidates.length} Produkte stimmen in 78 Spalten ueberein (Toleranz ${TOLERANCE})`);
    if (deviating.length > 0) console.warn(`[golden] abweichend (Anzahl Spalten): ${deviating.join(', ')}`);
    expect(matching).toBeGreaterThanOrEqual(MIN_MATCHING);
  }, 60000);
});
