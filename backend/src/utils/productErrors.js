import { AppError } from './AppError.js';

/**
 * 404 PRODUCT_NOT_FOUND (docs/SPEC.md 6.2) — EINE Stelle fuer productService, photoService und spaetere Services.
 * @returns {AppError}
 */
export function productNotFound() {
  return new AppError(404, 'PRODUCT_NOT_FOUND', 'Produkt nicht gefunden');
}
