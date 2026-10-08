/**
 * Reine Helfer fuer den Rezeptur-Editor von edit.html (docs/ARCHITECTURE.md 7.5) — ohne DOM, mit Unit-Tests.
 * Texte auf Deutsch (docs/SPEC.md 5.9: Dialog "Zutat loeschen" nennt Code, Name, Menge und erinnert daran,
 * dass die Naehrwerte erst nach dem Neuberechnen wechseln; Dialog "doppelte Zutat" nennt die vorhandenen Mengen).
 */
import { formatNumber } from './format.js';

const UNKNOWN_LABEL = 'unbekannt';
export const DELETE_HINT = 'Die Nährwerte ändern sich erst nach „Neu berechnen & speichern“.';
export const DUPLICATE_QUESTION = 'Trotzdem als neue Zeile hinzufügen?';

/**
 * "CODE – Bezeichnung" bzw. "CODE – unbekannt" (Zutat nicht mehr in lebtab).
 * @param {{LM_Zutat: string, zutat: {lebtab_Bezeich: string}|null}} row
 * @returns {string}
 */
export function rowLabel(row) {
  return `${row.LM_Zutat} – ${row.zutat ? row.zutat.lebtab_Bezeich : UNKNOWN_LABEL}`;
}

/**
 * IngredientRow[] -> Editor-Zeilen: Menge aus der DB wird zum Text im Eingabefeld (unveraendert, keine Rundung).
 * @param {Array<import('../components/ingredientTable.js').IngredientRowLike>} ingredients
 * @returns {object[]}
 */
export function toEditorRows(ingredients) {
  return ingredients.map((row) => ({ ...row, mengeText: formatNumber(row.Menge) }));
}

/**
 * Antwort von #7/#8 (IngredientRow + lebtab_nutrition_stale) in Zeile und Flag zerlegen.
 * @param {Record<string, unknown>} res
 * @returns {{row: Record<string, unknown>, stale: number}}
 */
export function splitIngredientResponse(res) {
  const { lebtab_nutrition_stale: stale, ...row } = res;
  return { row, stale };
}

/**
 * Zeilen des Loesch-Dialogs (docs/SPEC.md 5.9).
 * @param {{LM_Zutat: string, Menge: number, zutat: object|null}} row
 * @returns {string[]}
 */
export function deleteDialogLines(row) {
  return [rowLabel(row), `Menge: ${formatNumber(row.Menge)} g`, DELETE_HINT];
}

/**
 * Zeilen des Dialogs bei DUPLICATE_INGREDIENT (docs/SPEC.md 5.3, 5.9): vorhandene Mengen aller Zeilen des Paars.
 * @param {{LM_Zutat: string, zutat: object|null}} pending die Zutat, die hinzugefuegt werden soll
 * @param {Array<{id: number, Menge: number}>} existing aus der API-Antwort
 * @returns {string[]}
 */
export function duplicateDialogLines(pending, existing) {
  const mengen = existing.map((row) => `${formatNumber(row.Menge)} g`).join(', ');
  const count = existing.length === 1 ? 'ist bereits enthalten' : `ist bereits ${existing.length}-mal enthalten`;
  return [`${rowLabel(pending)} ${count} (Menge: ${mengen}).`, DUPLICATE_QUESTION];
}
