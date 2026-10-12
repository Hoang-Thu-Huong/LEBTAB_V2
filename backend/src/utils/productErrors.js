import { AppError } from './AppError.js';

/**
 * 404 PRODUCT_NOT_FOUND (docs/SPEC.md 6.2) — EINE Stelle fuer productService, photoService und spaetere Services.
 * @returns {AppError}
 */
export function productNotFound() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'Produkt nicht gefunden');
}

/**
 * #8/#9: Rezepturzeile fehlt (z. B. in einem anderen Tab geloescht), gehoert nicht zu :lmc oder :id ist kaputt.
 * Code bleibt PRODUCT_NOT_FOUND (docs/SPEC.md 6.2); nur der Text nennt die Zeile statt des Produkts (DECISIONS #104).
 * @returns {AppError}
 */
export function ingredientRowNotFound() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'Zutatenzeile nicht gefunden – bitte Seite neu laden');
}

/**
 * #4/#6: _row_version passt nicht (docs/SPEC.md 5.6) — current = aktueller Datensatz wie #2 (conflictDialog).
 * @param {Record<string, unknown>} current
 * @returns {AppError}
 */
export function versionConflict(current) {
  const err = new AppError(409, 'VERSION_CONFLICT', 'Das Produkt wurde inzwischen von jemand anderem geändert');
  err.current = current;
  return err;
}

/**
 * #6: Rezeptur hat sich seit der Vorschau #17 geaendert (recipeVersion passt nicht) — nichts gespeichert.
 * @returns {AppError}
 */
export function recipeChanged() {
  return new AppError(409, 'RECIPE_CHANGED', 'Die Rezeptur wurde inzwischen geändert – bitte die Vorschau erneut prüfen');
}
