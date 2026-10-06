/**
 * Pfade und Dateinamen der Produktfotos (docs/SPEC.md 5.8). Reine Funktionen: keine DB, kein Express, kein fs.
 * JEDER Pfad unterhalb von active/ entsteht ueber safePath() bzw. productDir() — nie URL-Parameter direkt in einen Pfad einsetzen.
 */
import path from 'node:path';
import { UPLOAD_DIR } from '../config/uploadDir.js';
import { AppError } from './AppError.js';
import { LMC_PATTERN } from './validators.js';

export const PHOTO_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);
/** Nur diese Endungen: express.static leitet den Content-Type aus der Endung ab — .html/.svg waeren aktive Inhalte. */
export const PHOTO_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
/** Laenge des bereinigten Namens ohne Zeitstempel-Praefix (Windows: Pfad insgesamt max. 260 Zeichen). */
export const PHOTO_NAME_MAX_LENGTH = 100;
export const TMP_DIR = path.join(UPLOAD_DIR, 'tmp');
export const ACTIVE_DIR = path.join(UPLOAD_DIR, 'active');

const FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const FALLBACK_BASENAME = 'foto';

/** @returns {AppError} 404 PHOTO_NOT_FOUND */
export function photoNotFound() {
  return new AppError(404, 'PHOTO_NOT_FOUND', 'Foto nicht gefunden');
}

/** @param {unknown} name @returns {boolean} nur [A-Za-z0-9._-], nie '..' */
export function isValidPhotoFilename(name) {
  return typeof name === 'string' && FILENAME_PATTERN.test(name) && !name.includes('..');
}

/** @param {unknown} name @returns {boolean} Endung .png/.jpg/.jpeg/.gif/.webp, Gross-/Kleinschreibung egal */
export function hasPhotoExtension(name) {
  return typeof name === 'string' && PHOTO_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

/**
 * Ordner active/<lmc>/. lmc muss die Schreibweise aus der DB sein (photoService.resolveLmc).
 * @param {string} lmc
 * @returns {string} absoluter Pfad
 * @throws {AppError} 404 PHOTO_NOT_FOUND bei falsch geformter lmc
 */
export function productDir(lmc) {
  if (typeof lmc !== 'string' || !LMC_PATTERN.test(lmc)) throw photoNotFound();
  return path.join(ACTIVE_DIR, lmc);
}

/**
 * Absoluter Pfad einer Fotodatei — garantiert direkt in active/<lmc>/ (Schutz vor Path Traversal).
 * @param {string} lmc
 * @param {string} filename
 * @returns {string}
 * @throws {AppError} 404 PHOTO_NOT_FOUND bei ungueltiger lmc / ungueltigem Namen
 */
export function safePath(lmc, filename) {
  if (!isValidPhotoFilename(filename)) throw photoNotFound();
  const dir = productDir(lmc);
  const resolved = path.resolve(dir, filename);
  const inside = path.dirname(resolved) === dir && resolved.startsWith(ACTIVE_DIR + path.sep);
  if (!inside) throw photoNotFound();
  return resolved;
}

/**
 * Macht aus dem Namen des Benutzers einen sicheren Dateinamen: fremde Zeichen -> '_', nie '..', kein fuehrender
 * Punkt, hoechstens PHOTO_NAME_MAX_LENGTH Zeichen (Endung bleibt erhalten). Ergebnis besteht isValidPhotoFilename.
 * @param {unknown} originalname
 * @returns {string}
 */
export function sanitizeFilename(originalname) {
  const cleaned = String(originalname ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.');
  const lastDot = cleaned.lastIndexOf('.');
  const rawExt = lastDot >= 0 ? cleaned.slice(lastDot) : '';
  const ext = rawExt === '.' ? '' : rawExt;
  const rawBase = lastDot >= 0 ? cleaned.slice(0, lastDot) : cleaned;
  const base = rawBase.replace(/^\.+/, '') || FALLBACK_BASENAME;
  const baseLength = Math.max(1, PHOTO_NAME_MAX_LENGTH - ext.length);
  // Der Schnitt kann auf einem Punkt enden ('aaa.' + '.jpg' ergaebe '..'): Punkte am Ende des gekuerzten Namens weg.
  const shortBase = base.slice(0, baseLength).replace(/\.+$/, '') || FALLBACK_BASENAME;
  return (shortBase + ext).slice(0, PHOTO_NAME_MAX_LENGTH);
}

/**
 * Endgueltiger Dateiname: <Zeitstempel>-<bereinigter Name> (docs/SPEC.md 5.8).
 * @param {unknown} originalname
 * @param {number} timestamp Date.now()
 * @returns {string}
 */
export function buildPhotoFilename(originalname, timestamp) {
  return `${timestamp}-${sanitizeFilename(originalname)}`;
}
