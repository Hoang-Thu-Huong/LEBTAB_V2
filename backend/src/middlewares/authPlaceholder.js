/** Platzhalter fuer spaetere Authentifizierung: laesst immer durch (docs/SPEC.md 1.4). */
export function authPlaceholder(req, _res, next) {
  req.user = null;
  next();
}
