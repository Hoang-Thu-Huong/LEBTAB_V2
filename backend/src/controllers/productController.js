import * as productService from '../services/productService.js';

export async function listProducts(req, res, next) {
  try {
    res.status(200).json(await productService.listProducts(req.query));
  } catch (err) {
    next(err);
  }
}

export async function getProduct(req, res, next) {
  try {
    res.status(200).json(await productService.getProduct(req.params.lmc));
  } catch (err) {
    next(err);
  }
}

/** HEAD #2b: nur Status, nie Body. DB-Fehler gehen an errorHandler (503), damit das Frontend "unbekannt" von "frei" trennt. */
export async function headProduct(req, res, next) {
  try {
    const found = await productService.productExists(req.params.lmc);
    res.status(found ? 200 : 404).end();
  } catch (err) {
    next(err);
  }
}

/** POST #3: der Body kommt validiert aus validateRequest(parseCreateProductBody) in req.validated. */
export async function createProduct(req, res, next) {
  try {
    res.status(201).json(await productService.createProduct(req.validated));
  } catch (err) {
    next(err);
  }
}

/** PUT #4: Body validiert durch parseUpdateProductBody. */
export async function updateProduct(req, res, next) {
  try {
    res.status(200).json(await productService.updateProduct(req.params.lmc, req.validated));
  } catch (err) {
    next(err);
  }
}

/** GET #17: Vorschau der Neuberechnung — liest nur. */
export async function previewRecalculation(req, res, next) {
  try {
    res.status(200).json(await productService.previewRecalculation(req.params.lmc));
  } catch (err) {
    next(err);
  }
}

/** POST #6: Body validiert durch parseRecalculateBody. */
export async function recalculateProduct(req, res, next) {
  try {
    res.status(200).json(await productService.recalculateProduct(req.params.lmc, req.validated));
  } catch (err) {
    next(err);
  }
}
