import fs from 'node:fs';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { PHOTO_MAX_FILES_PER_REQUEST, PHOTO_MAX_SIZE } from '../utils/limits.js';
import { PHOTO_MIME_TYPES, TMP_DIR, hasPhotoExtension } from '../utils/photoStorage.js';

// multer schreibt nach tmp/ (NICHT nach active/): erst photoService prueft das Limit von 10 Fotos und verschiebt
// dann alle Dateien oder keine (docs/SPEC.md 5.8, DECISIONS #26). destination ist eine FUNKTION, damit tmp/ erst
// beim ersten Upload entsteht und nicht schon beim Import (Tests, Contract-Tests). Ohne `filename` vergibt multer
// einen zufaelligen Hex-Namen — der endgueltige Name entsteht erst im Service.
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdir(TMP_DIR, { recursive: true }, (err) => cb(err, TMP_DIR));
  },
});

/** Typ UND Endung muessen stimmen: die Endung bestimmt spaeter den Content-Type von /uploads (kein .html/.svg). */
function fileFilter(_req, file, cb) {
  if (PHOTO_MIME_TYPES.includes(file.mimetype) && hasPhotoExtension(file.originalname)) {
    cb(null, true);
    return;
  }
  cb(new AppError(400, 'INVALID_FILE', 'Nur Bilder (PNG, JPEG, GIF, WebP) sind erlaubt'));
}

/** Middleware fuer #15: Feld `photos`, max. 10 Dateien je Request, max. 10 MB je Datei. Fuellt req.files. */
export const uploadPhotoFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: PHOTO_MAX_SIZE, files: PHOTO_MAX_FILES_PER_REQUEST },
  defParamCharset: 'utf8', // Dateinamen mit Umlauten korrekt lesen (Standard waere latin1)
}).array('photos', PHOTO_MAX_FILES_PER_REQUEST);
