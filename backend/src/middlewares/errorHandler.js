import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { PHOTO_MAX_FILES_PER_REQUEST, PHOTO_MAX_SIZE } from '../utils/limits.js';

/** mysql2-/Netzwerk-Fehlercodes, die "Datenbank nicht erreichbar" bedeuten (docs/SPEC.md 6.2 DB_UNAVAILABLE). */
const DB_DOWN_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
]);

const BYTES_PER_MB = 1024 * 1024;
/** multer-Fehlercodes -> deutsche Meldung fuer 400 INVALID_FILE (docs/SPEC.md 6.2). */
const UPLOAD_MESSAGES = {
  LIMIT_FILE_SIZE: `Datei zu groß (maximal ${PHOTO_MAX_SIZE / BYTES_PER_MB} MB)`,
  LIMIT_FILE_COUNT: `Zu viele Dateien (maximal ${PHOTO_MAX_FILES_PER_REQUEST} pro Upload)`,
  LIMIT_UNEXPECTED_FILE: 'Unerwartetes Dateifeld (erwartet: photos)',
};
const UPLOAD_FALLBACK_MESSAGE = 'Upload fehlgeschlagen';

function send(res, status, code, message) {
  res.status(status).json({ error: { code, message, status } });
}

/**
 * Letzte Middleware: formatiert jeden Fehler als { error: { code, message, status, details? } } (docs/SPEC.md 6).
 * Unbekannte Fehler -> 500 INTERNAL_ERROR, ohne sqlMessage/Stack in der Antwort.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.message, status: err.status } };
    if (err.details !== undefined) body.error.details = err.details;
    if (err.current !== undefined) body.current = err.current;
    if (err.status >= 500) logger.error(err.code, { path: req.originalUrl, stack: err.stack });
    res.status(err.status).json(body);
    return;
  }
  if (err && err.type === 'entity.parse.failed') {
    send(res, 400, 'VALIDATION_ERROR', 'Ungültiges JSON im Request-Body');
    return;
  }
  // Express-Router: Pfad mit kaputter %-Kodierung (/api/products/%E0%A4%A) -> URIError mit status 400, BEVOR ein
  // Controller laeuft. Kein Serverfehler: wie eine unbekannte Route beantworten, nicht loggen (DECISIONS #68).
  if (err instanceof URIError && err.status === 400) {
    send(res, 404, 'NOT_FOUND', 'Endpunkt nicht gefunden');
    return;
  }
  // multer (Upload #15): Datei zu gross, zu viele Dateien, falsches Feld — Eingabefehler, kein Serverfehler.
  if (err && err.name === 'MulterError') {
    send(res, 400, 'INVALID_FILE', UPLOAD_MESSAGES[err.code] ?? UPLOAD_FALLBACK_MESSAGE);
    return;
  }
  if (err && DB_DOWN_CODES.has(err.code)) {
    logger.error('DB_UNAVAILABLE', { path: req.originalUrl, code: err.code });
    send(res, 503, 'DB_UNAVAILABLE', 'Datenbank nicht erreichbar');
    return;
  }
  logger.error('INTERNAL_ERROR', { path: req.originalUrl, message: err?.message, stack: err?.stack });
  send(res, 500, 'INTERNAL_ERROR', 'Interner Serverfehler');
}
