import * as photoService from '../services/photoService.js';

/**
 * Liest den restlichen Request-Body, ohne ihn zu speichern. Noetig, wenn VOR multer ein Fehler feststeht: antwortet
 * der Server, waehrend der Browser noch Dateien sendet, bricht die Verbindung ab (ECONNRESET) und der Benutzer
 * sieht "Server nicht erreichbar" statt der eigentlichen Meldung.
 * @param {import('express').Request} req
 * @returns {Promise<void>}
 */
function discardBody(req) {
  return new Promise((resolve) => {
    if (req.readableEnded || req.destroyed) {
      resolve();
      return;
    }
    req.once('end', resolve);
    req.once('error', resolve);
    req.once('close', resolve);
    req.resume();
  });
}

/**
 * Middleware VOR multer (#15): unbekanntes Produkt -> 404, bevor eine Datei angenommen wird.
 * Legt die Schreibweise aus der DB in res.locals.lmc ab (Ordnername, docs/SPEC.md 5.8).
 */
export async function resolveProduct(req, res, next) {
  try {
    res.locals.lmc = await photoService.resolveLmc(req.params.lmc);
    next();
  } catch (err) {
    await discardBody(req); // nichts landet auf der Platte — die Bytes werden nur verworfen
    next(err);
  }
}

export async function listPhotos(req, res, next) {
  try {
    res.status(200).json(await photoService.listPhotos(req.params.lmc));
  } catch (err) {
    next(err);
  }
}

export async function uploadPhotos(req, res, next) {
  try {
    res.status(201).json(await photoService.addPhotos(res.locals.lmc, req.files));
  } catch (err) {
    next(err);
  }
}

export async function deletePhoto(req, res, next) {
  try {
    res.status(200).json(await photoService.deletePhoto(req.params.lmc, req.params.filename));
  } catch (err) {
    next(err);
  }
}
