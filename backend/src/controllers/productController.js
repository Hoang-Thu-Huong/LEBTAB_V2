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
