import { Router } from 'express';
import {
  listProducts,
  getProduct,
  headProduct,
  createProduct,
  updateProduct,
  previewRecalculation,
  recalculateProduct,
} from '../controllers/productController.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { parseCreateProductBody, parseUpdateProductBody, parseRecalculateBody } from '../utils/productPayload.js';
import { photoRoutes } from './photoRoutes.js';
import { ingredientRoutes } from './ingredientRoutes.js';

export const productRoutes = Router();
productRoutes.get('/', listProducts);
productRoutes.post('/', validateRequest(parseCreateProductBody), createProduct); // #3
// HEAD MUSS vor GET stehen: sonst bedient Express HEAD ueber den GET-Handler (92 Spalten + Rezeptur) — SPEC #2b.
productRoutes.head('/:lmc', headProduct);
productRoutes.get('/:lmc', getProduct);
productRoutes.put('/:lmc', validateRequest(parseUpdateProductBody), updateProduct); // #4
productRoutes.get('/:lmc/recalculation', previewRecalculation); // #17 Vorschau, schreibt nie
productRoutes.post('/:lmc/recalculate', validateRequest(parseRecalculateBody), recalculateProduct); // #6
productRoutes.use('/:lmc/photos', photoRoutes); // #14, #15, #16
productRoutes.use('/:lmc/ingredients', ingredientRoutes); // #7, #8, #9
