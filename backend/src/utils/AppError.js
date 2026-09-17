/**
 * Einheitlicher Anwendungsfehler (docs/SPEC.md 6, 6.2).
 * Alle Backend-Fehler werden als AppError geworfen; errorHandler formatiert daraus die JSON-Antwort.
 */
export class AppError extends Error {
  /**
   * @param {number} status HTTP-Status
   * @param {string} code Maschinenlesbarer Code (Englisch), z. B. 'PRODUCT_NOT_FOUND'
   * @param {string} message Meldung fuer den Benutzer (Deutsch)
   * @param {Array<{field: string, issue: string}>} [details] Nur bei VALIDATION_ERROR
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
