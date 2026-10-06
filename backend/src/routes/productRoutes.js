import { Router } from 'express';
import { listProducts, getProduct, headProduct } from '../controllers/productController.js';

export const productRoutes = Router();
productRoutes.get('/', listProducts);
// HEAD MUSS vor GET stehen: sonst bedient Express HEAD ueber den GET-Handler (92 Spalten + Rezeptur) — SPEC #2b.
productRoutes.head('/:lmc', headProduct);
productRoutes.get('/:lmc', getProduct);
