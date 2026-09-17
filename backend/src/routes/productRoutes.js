import { Router } from 'express';
import { listProducts } from '../controllers/productController.js';

export const productRoutes = Router();
productRoutes.get('/', listProducts);
