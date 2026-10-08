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
