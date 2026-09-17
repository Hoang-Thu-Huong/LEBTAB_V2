import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/** mysql2-Fehlercodes, die "Datenbank nicht erreichbar" bedeuten (docs/SPEC.md 6.2 DB_UNAVAILABLE). */
const DB_DOWN_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
]);

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
  if (err && DB_DOWN_CODES.has(err.code)) {
    logger.error('DB_UNAVAILABLE', { path: req.originalUrl, code: err.code });
    send(res, 503, 'DB_UNAVAILABLE', 'Datenbank nicht erreichbar');
    return;
  }
  logger.error('INTERNAL_ERROR', { path: req.originalUrl, message: err?.message, stack: err?.stack });
  send(res, 500, 'INTERNAL_ERROR', 'Interner Serverfehler');
}
