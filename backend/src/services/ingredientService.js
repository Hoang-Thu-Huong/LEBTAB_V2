/**
 * Zutaten-Logik (docs/SPEC.md 5.3, 5.4). Phase 6: nur die Referenzpruefung fuer createProduct; die Endpunkte
 * #7/#8/#9 folgen in Phase 7. Importiert NIE nutritionService (docs/SPEC.md 5.2).
 */
import { AppError } from '../utils/AppError.js';
import * as lebtabModel from '../models/lebtabModel.js';

/** c_zutab.Version fuer app-erzeugte Zeilen: 0, bis die Fachseite die Bedeutung klaert (DECISIONS #42, #90). */
export const NEW_ROW_VERSION = 0;
/** c_zutab.Anrcode fuer app-erzeugte Zeilen: 0 (NOT NULL, keine Logik — docs/DATA.md 4.2). */
export const NEW_ROW_ANRCODE = 0;

/**
 * Harte Referenzpruefung fuer NEUE Rezepturzeilen (docs/SPEC.md 5.4): jede LM_Zutat muss als Produkt existieren —
 * jede Itemart, auch A. EINE Abfrage fuer alle Codes. Liefert die Zeilen mit lebtab_lmc in DB-Schreibweise.
 * @param {Array<{LM_Zutat: string, Menge: number}>} ingredients bereits validiert (parseCreateProductBody)
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<Array<{LM_Zutat: string, Menge: number}>>}
 * @throws {AppError} 400 INGREDIENT_NOT_FOUND mit details fuer jede fehlende Zeile
 */
export async function validateIngredientRefs(ingredients, conn) {
  if (ingredients.length === 0) return [];
  const stored = await lebtabModel.findStoredLmcs(ingredients.map((row) => row.LM_Zutat), conn);
  const byKey = new Map(stored.map((lmc) => [lmc.toLowerCase(), lmc]));
  const details = [];
  const missing = [];
  const resolved = ingredients.map((row, index) => {
    const lmc = byKey.get(row.LM_Zutat.toLowerCase());
    if (lmc === undefined) {
      missing.push(row.LM_Zutat);
      details.push({ field: `ingredients[${index}].LM_Zutat`, issue: `Zutat ${row.LM_Zutat} existiert nicht` });
      return row;
    }
    return { ...row, LM_Zutat: lmc };
  });
  if (missing.length > 0) {
    throw new AppError(400, 'INGREDIENT_NOT_FOUND', `Zutat ${missing[0]} existiert nicht`, details);
  }
  return resolved;
}
