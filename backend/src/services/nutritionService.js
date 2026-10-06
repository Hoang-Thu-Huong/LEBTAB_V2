/**
 * Naehrwertberechnung nach docs/SPEC.md 5.1. In Phase 3 nur calculateNutrition (liest, schreibt nie);
 * recalculateNutrition (schreibt die 79 Spalten) folgt in Phase 8.
 * NICHT aus ingredientService importieren — Zutaten-Endpunkte berechnen nie neu (docs/SPEC.md 5.2).
 */
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import * as lebtabModel from '../models/lebtabModel.js';

/** Itemart der Zusatz-Codes (Vitamine, Mineralstoffe ...): ihre lebtab-Zeile ist ein Marker-Vektor (DECISIONS #46). */
const ZUSATZ_ITEMART = 'A';
/** Die Naehrwerte in lebtab gelten je 100 g, Menge ist in Gramm. */
const REFERENCE_AMOUNT = 100;

/**
 * @typedef {{LM_Zutat: string, Menge: number, id?: number}} IngredientInput
 * @typedef {{reason: 'NOT_FOUND_IN_LEBTAB' | 'A_MARKER_EMPTY', LM_Zutat: string}
 *   | {reason: 'DUPLICATE_OVERRIDE', LM_Zutat: string, ids: Array<number | null>, Mengen: number[]}
 *   | {reason: 'RECIPE_DUPLICATED', faktor: number}} NutritionWarning
 * @typedef {{nutrition: Record<string, number | null>, warnings: NutritionWarning[], contributingRows: number}} NutritionResult
 */

/** Kollation _ci: 'afb000' und 'AFB000' sind derselbe Code (DECISIONS #76, wie docs/SPEC.md 5.4). */
function codeKey(code) {
  return String(code).toLowerCase();
}

/** Menge = 0 nimmt nicht teil (DECISIONS #48); negative oder nicht-numerische Mengen ebenso wenig. */
function participates(row) {
  return Number.isFinite(row.Menge) && row.Menge > 0;
}

/**
 * Laedt die lebtab-Zeilen aller teilnehmenden Zutaten mit EINER Abfrage (kein N+1).
 * @param {IngredientInput[]} rows nur teilnehmende Zeilen
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<Map<string, Record<string, unknown>>>} codeKey -> lebtab-Zeile
 */
async function loadReferences(rows, conn) {
  const codes = new Map();
  for (const row of rows) if (!codes.has(codeKey(row.LM_Zutat))) codes.set(codeKey(row.LM_Zutat), row.LM_Zutat);
  const found = await lebtabModel.findNutritionByLmcs([...codes.values()], conn);
  return new Map(found.map((reference) => [codeKey(reference.lebtab_lmc), reference]));
}

/** Spalten, die ein Zusatz-Code ueberschreibt: Wert weder NULL noch 0. */
function markerColumns(reference) {
  return NUTRITION_COLUMNS.filter((column) => reference[column] != null && reference[column] !== 0);
}

/**
 * Schritt 1 (Summe Menge x Wert der normalen Zutaten) und Schritt 2 (Menge x Marker der Zusaetze) ueber alle Zeilen.
 * @param {IngredientInput[]} rows nur teilnehmende Zeilen
 * @param {Map<string, Record<string, unknown>>} references
 */
function accumulate(rows, references) {
  const sums = Object.fromEntries(NUTRITION_COLUMNS.map((column) => [column, 0]));
  const overrides = new Map();
  const zusatzRows = new Map();
  const skipped = new Map();
  let regularCount = 0;
  for (const row of rows) {
    const key = codeKey(row.LM_Zutat);
    const reference = references.get(key);
    if (!reference) {
      if (!skipped.has(key)) skipped.set(key, { reason: 'NOT_FOUND_IN_LEBTAB', LM_Zutat: row.LM_Zutat });
    } else if (reference.lebtab_Itemart !== ZUSATZ_ITEMART) {
      for (const column of NUTRITION_COLUMNS) sums[column] += row.Menge * (reference[column] ?? 0);
      regularCount += 1;
    } else {
      const markers = markerColumns(reference);
      if (markers.length === 0) {
        if (!skipped.has(key)) skipped.set(key, { reason: 'A_MARKER_EMPTY', LM_Zutat: row.LM_Zutat });
      } else {
        for (const column of markers) {
          overrides.set(column, (overrides.get(column) ?? 0) + row.Menge * reference[column]);
        }
        zusatzRows.set(key, [...(zusatzRows.get(key) ?? []), row]);
      }
    }
  }
  return { sums, overrides, zusatzRows, skipped, regularCount };
}

/** Derselbe Zusatz-Code in >= 2 teilnehmenden Zeilen: wird summiert und gemeldet (DECISIONS #47). */
function duplicateOverrideWarnings(zusatzRows) {
  return [...zusatzRows.values()]
    .filter((rows) => rows.length > 1)
    .map((rows) => ({
      reason: 'DUPLICATE_OVERRIDE',
      LM_Zutat: rows[0].LM_Zutat,
      ids: rows.map((row) => row.id ?? null),
      Mengen: rows.map((row) => row.Menge),
    }));
}

/**
 * Faktor n, wenn JEDES Paar (LM_Zutat, Menge) genau n >= 2 mal vorkommt und es >= 2 verschiedene Paare gibt
 * (beim Import n-fach duplizierte Rezeptur, DECISIONS #49). Zaehlt ALLE uebergebenen Zeilen, auch Menge = 0.
 * @param {IngredientInput[]} ingredients
 * @returns {number | null}
 */
function duplicationFactor(ingredients) {
  const counts = new Map();
  for (const row of ingredients) {
    const pair = `${codeKey(row.LM_Zutat)}|${row.Menge}`;
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  if (counts.size < 2) return null;
  const [first, ...rest] = counts.values();
  return first >= 2 && rest.every((count) => count === first) ? first : null;
}

/**
 * Berechnet die 79 Naehrwerte aus einer Zutatenliste (docs/SPEC.md 5.1). Liest nur, schreibt nie.
 * Schritt 1: Summe(Menge x Wert) / 100 ueber normale Zutaten. Schritt 2: Zusatz-Zeilen (Itemart A) ERSETZEN das
 * Ergebnis in ihren Marker-Spalten durch Summe(Menge x Marker), ohne Division. Keine Rundung, keine Normierung auf 100 g.
 * Traegt keine Zeile bei (contributingRows === 0), sind alle 79 Werte null — nie 0.
 * @param {IngredientInput[]} ingredients Rezepturzeilen (c_zutab-Zeilen oder Payload {LM_Zutat, Menge})
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<NutritionResult>}
 */
export async function calculateNutrition(ingredients, conn) {
  const rows = ingredients.filter(participates);
  const references = await loadReferences(rows, conn);
  const { sums, overrides, zusatzRows, skipped, regularCount } = accumulate(rows, references);

  const nutrition = {};
  for (const column of NUTRITION_COLUMNS) {
    if (overrides.has(column)) nutrition[column] = overrides.get(column);
    else nutrition[column] = regularCount > 0 ? sums[column] / REFERENCE_AMOUNT : null;
  }

  const warnings = [...skipped.values(), ...duplicateOverrideWarnings(zusatzRows)];
  const faktor = duplicationFactor(ingredients);
  if (faktor !== null) warnings.push({ reason: 'RECIPE_DUPLICATED', faktor });

  let zusatzCount = 0;
  for (const group of zusatzRows.values()) zusatzCount += group.length;
  return { nutrition, warnings, contributingRows: regularCount + zusatzCount };
}
