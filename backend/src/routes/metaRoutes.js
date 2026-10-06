import { Router } from 'express';
import { getMeta } from '../controllers/metaController.js';

export const metaRoutes = Router();
metaRoutes.get('/', getMeta);
