/**
 * Inhalt des Dialogs "Neu berechnen & speichern" (docs/SPEC.md 5.9, docs/ARCHITECTURE.md 7.5) aus der Vorschau #17 —
 * rein, ohne DOM, mit Unit-Tests. Welche Werte sich aendern, rechnet das Backend aus (das Frontend kennt die
 * Naehrwerte der Zutaten nicht); hier wird nur verglichen und formuliert.
 */
import { formatNumber } from './format.js';
import { isZusatz, summarizeIngredients } from './ingredients.js';
import { rowLabel } from './ingredientEdit.js';

/** Gleiche Toleranz wie der Golden-Test (DECISIONS #73): kleinere Unterschiede sind Rechenrauschen, keine Aenderung. */
const SAME_TOLERANCE = 1e-9;

/**
 * @typedef {{lmc: string, current: Record<string, number|null>, nutrition: Record<string, number|null>,
 *   contributingRows: number, warnings: Array<{reason: string, LM_Zutat?: string, faktor?: number}>,
 *   ingredients: object[], recipeVersion: string, _row_version: number}} RecalcPreview
 * @typedef {{key: string, label: string, unit: string|null}} NutritionField
 */

function sameValue(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  return Math.abs(a - b) <= SAME_TOLERANCE;
}

/**
 * Spalten, deren Wert sich durch das Speichern aendert — in der Reihenfolge der Naehrwerttabelle (meta.nutritionFields).
 * @param {Record<string, number|null>} current gespeichert
 * @param {Record<string, number|null>} next berechnet
 * @param {NutritionField[]} fields meta.nutritionFields (#13)
 * @returns {Array<{key: string, label: string, unit: string|null, before: number|null, after: number|null}>}
 */
export function changedValues(current, next, fields) {
  return fields
    .filter((field) => !sameValue(current[field.key], next[field.key]))
    .map((field) => ({
      key: field.key,
      label: field.label,
      unit: field.unit ?? null,
      before: current[field.key] ?? null,
      after: next[field.key] ?? null,
    }));
}

const warn = (text) => ({ text, warn: true });
const withUnit = (value, unit) => (value === null || !unit ? formatNumber(value) : `${formatNumber(value)} ${unit}`);

/** Zeilen, die nicht einfliessen: Menge 0 (auch Zusaetze, Entscheidung 08/10/2026), unbekannte Codes, leere Zusaetze. */
function skippedLines(preview) {
  const lines = [];
  for (const row of preview.ingredients) {
    if (row.Menge === 0) lines.push(`${rowLabel(row)}${isZusatz(row) ? ' (Zusatz)' : ''} — Menge 0`);
    else if (row.zutat === null) lines.push(`${rowLabel(row)} — Code nicht in der Datenbank`);
  }
  for (const w of preview.warnings) {
    if (w.reason === 'A_MARKER_EMPTY') lines.push(`${w.LM_Zutat} (Zusatz) — ohne Wirkung (kein Nährwert markiert)`);
  }
  return lines;
}

/**
 * Inhalt fuer confirmDialog: Titel, Zeilen vor der Tabelle, Tabelle "bisher -> neu", Hinweise danach.
 * @param {RecalcPreview} preview
 * @param {NutritionField[]} fields meta.nutritionFields
 * @param {string|null} [notice] z. B. Meldung von 409 RECIPE_CHANGED, rot ganz oben
 * @returns {{title: string, lines: Array<string|{text: string, warn: boolean}>,
 *   table: {head: string[], rows: string[][]}|null, notes: Array<string|{text: string, warn: boolean}>,
 *   confirmLabel: string}}
 */
export function recalcDialogContent(preview, fields, notice = null) {
  const changes = changedValues(preview.current, preview.nutrition, fields);
  const lines = [];
  if (notice) lines.push(warn(notice));
  if (preview.contributingRows === 0) lines.push(warn('Keine Zutat fließt ein — alle 79 Werte werden geleert.'));
  lines.push(
    changes.length === 0
      ? 'Keiner der 79 Werte ändert sich.'
      : `${changes.length} von 79 Werten ${changes.length === 1 ? 'ändert' : 'ändern'} sich:`,
  );
  const table =
    changes.length === 0
      ? null
      : {
          head: ['Wert', 'bisher', 'neu'],
          rows: changes.map((c) => [c.label, withUnit(c.before, c.unit), withUnit(c.after, c.unit)]),
        };

  const notes = [];
  const { sum, sumOk } = summarizeIngredients(preview.ingredients);
  notes.push(`Summe der Zutaten: ${formatNumber(sum)} g`);
  if (!sumOk) notes.push(warn('≠ 100 g — die Nährwerte beziehen sich dann nicht auf 100 g'));
  const duplicated = preview.warnings.find((w) => w.reason === 'RECIPE_DUPLICATED');
  if (duplicated) {
    notes.push(warn(`Rezeptur ist ${duplicated.faktor}-fach dupliziert — Ergebnis wird ${duplicated.faktor}-fach zu hoch`));
  }
  const skipped = skippedLines(preview);
  if (skipped.length > 0) notes.push('Übersprungen (fließen nicht ein):', ...skipped.map((t) => `• ${t}`));
  const zusaetze = preview.ingredients.filter((row) => isZusatz(row) && row.Menge > 0);
  if (zusaetze.length > 0) {
    notes.push(
      `${zusaetze.length} ${zusaetze.length === 1 ? 'Zusatz ersetzt' : 'Zusätze ersetzen'} die berechneten Werte:`,
      ...zusaetze.map((row) => `• ${rowLabel(row)} — ${formatNumber(row.Menge)}`),
    );
  }
  for (const w of preview.warnings) {
    if (w.reason === 'DUPLICATE_OVERRIDE') notes.push(`Zusatz ${w.LM_Zutat} mehrfach — Werte werden summiert`);
  }
  notes.push('Die bisherigen Werte werden überschrieben und können nicht wiederhergestellt werden.');
  return { title: 'Nährwerte neu berechnen?', lines, table, notes, confirmLabel: 'Speichern' };
}

/**
 * Erfolgsmeldung nach dem Speichern (#6).
 * @param {number} changedCount Anzahl geaenderter Werte laut Vorschau
 * @returns {string}
 */
export function recalcSuccessText(changedCount) {
  if (changedCount === 0) return 'Nährwerte neu berechnet und gespeichert — keine Werte geändert.';
  return `Nährwerte neu berechnet und gespeichert — ${changedCount} von 79 Werten geändert.`;
}
