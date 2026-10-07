import { Router } from 'express';
import { exportCsv } from '../controllers/exportController.js';

export const exportRoutes = Router();
exportRoutes.get('/', exportCsv); // #12 ?type=lebtab|c_zutab
