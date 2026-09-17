import { AppError } from '../utils/AppError.js';

/** Nur fuer /api/*: unbekannte Route -> 404 JSON (docs/ARCHITECTURE.md 3.1, docs/SPEC.md 6.2). */
export function notFound(req, _res, next) {
  if (req.path.startsWith('/api/')) {
    next(new AppError(404, 'NOT_FOUND', 'Endpunkt nicht gefunden'));
    return;
  }
  next();
}
