import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** backend/ — Basis fuer .env und UPLOAD_DIR. */
export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// .env per absolutem Pfad laden, damit Vitest (root = Repo) und `node server.js` dasselbe sehen.
dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });
