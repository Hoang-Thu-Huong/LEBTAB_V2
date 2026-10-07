/**
 * Reine Rezeptur-Logik fuer das Frontend (docs/SPEC.md 5.1, 6.1.1; docs/ARCHITECTURE.md 7.3, 7.5).
 * Nur fuer die Anzeige — das Backend bleibt die Quelle der Wahrheit.
 */
export const MENGE_SUM_TOLERANCE = 0.05;
const ITEMART_ZUSATZ = 'A';
/** Anzeige-Tag fuer Itemart A — EINE Stelle fuer ingredientTable und ingredientPicker (docs/SPEC.md 5.4). */
export const ZUSATZ_LABEL = 'Zusatz';
const TARGET_SUM = 100;

/** Tag-Text einer Itemart: A -> "Zusatz", sonst der Buchstabe selbst. */
export function itemartLabel(itemart) {
  return itemart === ITEMART_ZUSATZ ? ZUSATZ_LABEL : itemart;
}

/** Zeile ist ein Zusatz (Itemart A)? Unbekannte Zutaten (zutat === null) sind KEIN Zusatz. */
export function isZusatz(row) {
  return row.zutat?.lebtab_Itemart === ITEMART_ZUSATZ;
}

/**
 * @param {Array<{Menge: number, zutat: {lebtab_Itemart: string}|null}>} rows IngredientRow[] in DB-Reihenfolge
 * @returns {{visibleRows: object[], hiddenZeroCount: number, sum: number, sumOk: boolean}}
 *   visibleRows: Zeilen mit Menge != 0 · sum: Summe ohne Zusaetze (unbekannte Zutaten zaehlen mit),
 *   NICHT gerundet (DECISIONS #58) · sumOk: |sum - 100| <= MENGE_SUM_TOLERANCE
 */
export function summarizeIngredients(rows) {
  const visibleRows = rows.filter((row) => row.Menge !== 0);
  let sum = 0;
  for (const row of visibleRows) {
    if (!isZusatz(row)) sum += row.Menge;
  }
  return {
    visibleRows,
    hiddenZeroCount: rows.length - visibleRows.length,
    sum,
    sumOk: Math.abs(sum - TARGET_SUM) <= MENGE_SUM_TOLERANCE,
  };
}
