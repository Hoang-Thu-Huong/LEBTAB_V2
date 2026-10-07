/**
 * Produktfotos auf der Platte (docs/SPEC.md 5.8, 6.1 #14-#16). Keine Tabelle/Spalte in der DB: die Liste ist der
 * Ordnerinhalt von active/<lmc>/. Die DB wird nur gelesen (existiert das Produkt? wie ist die lmc geschrieben?).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { PHOTO_MAX_PER_PRODUCT } from '../utils/limits.js';
import { isValidLmc } from '../utils/validators.js';
import { productNotFound } from '../utils/productErrors.js';
import {
  TMP_DIR,
  buildPhotoFilename,
  hasPhotoExtension,
  isValidPhotoFilename,
  photoNotFound,
  productDir,
  safePath,
} from '../utils/photoStorage.js';
import * as lebtabModel from '../models/lebtabModel.js';

const LIMIT_MESSAGE = `Maximal ${PHOTO_MAX_PER_PRODUCT} Fotos pro Produkt`;

function invalidFile(message) {
  return new AppError(400, 'INVALID_FILE', message);
}

/** Loescht Dateien, ohne zu werfen (fehlende Datei ist kein Fehler) — Aufraeumen darf den Ursprungsfehler nie verdecken. */
async function removeFiles(paths) {
  await Promise.allSettled(paths.map((filePath) => fs.rm(filePath, { force: true })));
}

/**
 * Fotos eines Ordners: nur regulaere Dateien mit gueltigem Namen und Bild-Endung, sortiert nach Dateiname
 * (= Upload-Reihenfolge, weil der Name mit dem Zeitstempel beginnt).
 * @param {string} storedLmc Schreibweise aus der DB
 * @returns {Promise<Array<{filename: string, url: string, size: number, modifiedAt: string}>>}
 */
async function readPhotos(storedLmc) {
  const dir = productDir(storedLmc);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const names = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isValidPhotoFilename(name) && hasPhotoExtension(name))
    .sort();
  return Promise.all(
    names.map(async (filename) => {
      const stat = await fs.stat(path.join(dir, filename));
      return {
        filename,
        url: `/uploads/${storedLmc}/${filename}`,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    }),
  );
}

/**
 * Verschiebt alle Dateien von tmp/ nach active/<lmc>/ — alle oder keine. Namenskollision -> Zeitstempel + 1.
 * @param {string} storedLmc
 * @param {Array<{path: string, originalname: string}>} files
 * @param {Set<string>} takenNames vorhandene Dateinamen, klein geschrieben (NTFS unterscheidet nicht)
 */
async function moveIntoActive(storedLmc, files, takenNames) {
  await fs.mkdir(productDir(storedLmc), { recursive: true });
  const moved = [];
  let timestamp = Date.now();
  try {
    for (const file of files) {
      let filename = buildPhotoFilename(file.originalname, timestamp);
      while (takenNames.has(filename.toLowerCase())) {
        timestamp += 1;
        filename = buildPhotoFilename(file.originalname, timestamp);
      }
      takenNames.add(filename.toLowerCase());
      const target = safePath(storedLmc, filename);
      await fs.rename(file.path, target);
      moved.push(target);
    }
  } catch (err) {
    await removeFiles([...moved, ...files.map((file) => file.path)]);
    throw err;
  }
}

/** Laufende Uploads je Produkt (Schluessel: lmc klein geschrieben). Eintrag verschwindet, sobald die Schlange leer ist. */
const uploadQueues = new Map();

/**
 * Fuehrt Uploads DESSELBEN Produkts nacheinander aus (ein Prozess, docs/ARCHITECTURE.md 3.1). Ohne das zaehlen zwei
 * gleichzeitige Requests denselben Stand (Limit wird ueberschritten) und koennen sich bei gleichem Dateinamen in
 * derselben Millisekunde gegenseitig ueberschreiben (DECISIONS #82). Andere Produkte warten nicht.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
async function runExclusive(key, task) {
  const previous = uploadQueues.get(key);
  let release;
  // Eigener "Zug": wird erst im finally aufgeloest und lehnt nie ab — der naechste Upload wartet nur darauf.
  const turn = new Promise((resolve) => {
    release = resolve;
  });
  uploadQueues.set(key, turn);
  try {
    if (previous) await previous;
    return await task();
  } finally {
    if (uploadQueues.get(key) === turn) uploadQueues.delete(key);
    release();
  }
}

/**
 * Prueft die Produktnummer und liefert sie so, wie sie in der DB steht (Ordnername; Kollation _ci: 'a1ck00' trifft
 * 'A1CK00'). Falsch geformte lmc -> 404 ohne DB-Zugriff (wie #2, DECISIONS #55).
 * @param {string} lmc aus der URL
 * @returns {Promise<string>}
 * @throws {AppError} 404 PRODUCT_NOT_FOUND
 */
export async function resolveLmc(lmc) {
  const storedLmc = isValidLmc(lmc) ? await lebtabModel.findStoredLmc(lmc, pool) : null;
  if (storedLmc === null) throw productNotFound();
  return storedLmc;
}

/**
 * Fotoliste eines Produkts (#14). Ordner fehlt -> [].
 * @param {string} lmc aus der URL
 * @returns {Promise<Array<{filename: string, url: string, size: number, modifiedAt: string}>>}
 * @throws {AppError} 404 PRODUCT_NOT_FOUND
 */
export async function listPhotos(lmc) {
  return readPhotos(await resolveLmc(lmc));
}

/**
 * Uebernimmt die von multer in tmp/ abgelegten Dateien (#15): Limit pruefen, dann ALLE nach active/ verschieben
 * oder KEINE (docs/SPEC.md 5.8). Im Fehlerfall bleibt nichts in tmp/ zurueck.
 * @param {string} storedLmc Ergebnis von resolveLmc (Controller-Middleware vor multer)
 * @param {Array<{path: string, originalname: string, size: number}> | undefined} files req.files
 * @returns {Promise<Array<{filename: string, url: string, size: number, modifiedAt: string}>>} alle Fotos danach
 * @throws {AppError} 400 INVALID_FILE | 400 PHOTO_LIMIT_EXCEEDED
 */
export function addPhotos(storedLmc, files) {
  return runExclusive(storedLmc.toLowerCase(), () => storePhotos(storedLmc, files));
}

async function storePhotos(storedLmc, files) {
  const incoming = files ?? [];
  if (incoming.length === 0) throw invalidFile('Keine Datei hochgeladen');
  const tmpPaths = incoming.map((file) => file.path);
  try {
    if (incoming.some((file) => file.size === 0)) {
      throw invalidFile('Leere Datei kann nicht hochgeladen werden');
    }
    const existing = await readPhotos(storedLmc);
    if (existing.length + incoming.length > PHOTO_MAX_PER_PRODUCT) {
      const free = Math.max(0, PHOTO_MAX_PER_PRODUCT - existing.length);
      throw new AppError(400, 'PHOTO_LIMIT_EXCEEDED', LIMIT_MESSAGE, [
        { field: 'photos', issue: `${LIMIT_MESSAGE} (aktuell ${existing.length}, frei ${free})` },
      ]);
    }
    const takenNames = new Set(existing.map((photo) => photo.filename.toLowerCase()));
    await moveIntoActive(storedLmc, incoming, takenNames);
  } catch (err) {
    // Egal wo es scheitert (leere Datei, Limit, Produktordner nicht lesbar/anlegbar): nichts bleibt in tmp/ zurueck.
    await removeFiles(tmpPaths);
    throw err;
  }
  return readPhotos(storedLmc);
}

/**
 * Loescht EIN Foto endgueltig (#16). Das Frontend fragt vorher per confirmDialog (docs/SPEC.md 5.9).
 * @param {string} lmc aus der URL
 * @param {string} filename aus der URL
 * @returns {Promise<{deleted: true, filename: string}>}
 * @throws {AppError} 404 PRODUCT_NOT_FOUND | 404 PHOTO_NOT_FOUND
 */
export async function deletePhoto(lmc, filename) {
  const storedLmc = await resolveLmc(lmc);
  const target = safePath(storedLmc, filename);
  if (!hasPhotoExtension(filename)) throw photoNotFound();
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw photoNotFound();
    await fs.unlink(target);
  } catch (err) {
    // ENOENT auch beim unlink: zwei Benutzer loeschen dasselbe Foto gleichzeitig -> der zweite bekommt 404, nicht 500.
    if (err.code === 'ENOENT') throw photoNotFound();
    throw err;
  }
  return { deleted: true, filename };
}

/**
 * Entfernt beim Serverstart liegengebliebene Dateien aus tmp/ (Absturz zwischen multer und Verschieben).
 * @returns {Promise<number>} Anzahl geloeschter Dateien; 0, wenn tmp/ nicht existiert
 */
export async function cleanTmpDir() {
  let entries;
  try {
    entries = await fs.readdir(TMP_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  const files = entries.filter((entry) => entry.isFile());
  await Promise.all(files.map((entry) => fs.unlink(path.join(TMP_DIR, entry.name))));
  return files.length;
}
