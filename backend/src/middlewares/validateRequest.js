/**
 * Body-Validierung VOR dem Controller (docs/SPEC.md 6.4). parse(body) liefert den normalisierten Wert
 * oder wirft AppError 400; das Ergebnis liegt in req.validated — Controller lesen nie req.body direkt.
 * @param {(body: unknown) => unknown} parse z. B. parseCreateProductBody
 * @returns {import('express').RequestHandler}
 */
export function validateRequest(parse) {
  return (req, res, next) => {
    try {
      req.validated = parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}
