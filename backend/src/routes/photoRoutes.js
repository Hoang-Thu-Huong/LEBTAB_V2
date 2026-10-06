import { Router } from 'express';
import { uploadPhotoFiles } from '../middlewares/upload.js';
import {
  resolveProduct,
  listPhotos,
  uploadPhotos,
  deletePhoto,
} from '../controllers/photoController.js';

/** Eingehaengt unter /api/products/:lmc/photos (productRoutes.js) — mergeParams reicht :lmc durch. */
export const photoRoutes = Router({ mergeParams: true });
photoRoutes.get('/', listPhotos);
// Reihenfolge ist Pflicht: erst 404 fuer unbekannte Produkte, DANN nimmt multer Dateien an (docs/SPEC.md #15).
photoRoutes.post('/', resolveProduct, uploadPhotoFiles, uploadPhotos);
photoRoutes.delete('/:filename', deletePhoto);
