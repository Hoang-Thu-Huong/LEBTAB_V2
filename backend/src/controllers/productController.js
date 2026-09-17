import * as productService from '../services/productService.js';

export async function listProducts(req, res, next) {
  try {
    res.status(200).json(await productService.listProducts(req.query));
  } catch (err) {
    next(err);
  }
}
