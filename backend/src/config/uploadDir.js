import path from 'node:path';
import { BACKEND_ROOT } from './env.js';

/**
 * Wurzel der Produktfotos (docs/SPEC.md 5.8): tmp/ (multer), active/<lmc>/ (ausgeliefert unter /uploads), archive/.
 * Eigenes Modul, damit app.js UND photoStorage.js denselben Wert sehen und Tests ihn per vi.mock auf ein
 * Temp-Verzeichnis umbiegen koennen — backend/uploads/ wird von Tests nie beruehrt.
 */
export const UPLOAD_DIR = path.resolve(BACKEND_ROOT, process.env.UPLOAD_DIR ?? './uploads');
