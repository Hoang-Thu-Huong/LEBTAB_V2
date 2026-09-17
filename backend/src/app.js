import { BACKEND_ROOT } from './config/env.js';
import express from 'express';
import path from 'node:path';
import { authPlaceholder } from './middlewares/authPlaceholder.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { productRoutes } from './routes/productRoutes.js';

export const FRONTEND_DIR = path.resolve(BACKEND_ROOT, '..', 'frontend');
export const UPLOAD_DIR = path.resolve(BACKEND_ROOT, process.env.UPLOAD_DIR ?? './uploads');

/**
 * Baut die Express-App mit der Middleware-Reihenfolge aus docs/ARCHITECTURE.md 3.2.
 * Getrennt von server.js, damit supertest die App ohne offenen Port nutzen kann.
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));
  app.use(authPlaceholder);

  app.use('/api/health', healthRoutes);
  app.use('/api/products', productRoutes);
  // Weitere Router (meta, archive, export) werden in spaeteren Phasen hier eingehaengt.

  app.use(express.static(FRONTEND_DIR));
  app.use('/uploads', express.static(path.join(UPLOAD_DIR, 'active')));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
