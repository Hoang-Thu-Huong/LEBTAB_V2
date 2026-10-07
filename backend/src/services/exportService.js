/**
 * CSV-Export #12 (docs/SPEC.md 6.1 #12): streamt eine ganze Tabelle Zeile fuer Zeile — DB -> csvFormatter -> Ausgabe.
 * Kennt express nicht: bekommt ein Writable und einen Callback, mit dem der Aufrufer die HTTP-Header setzt.
 */
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { pool } from '../config/db.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { AppError } from '../utils/AppError.js';
import { createCsvStream } from '../utils/csvFormatter.js';
import { LEBTAB_EXPORT_COLUMNS } from '../utils/exportColumns.js';
import { logger } from '../utils/logger.js';

/**
 * Je Tabelle: loadColumns(conn) liefert die Kopfzeile, openRows(rawConn) den Zeilen-Stream.
 * lebtab: feste 92 Originalspalten (nie die technischen). c_zutab: alle Spalten, die die Tabelle gerade hat.
 */
const EXPORTS = Object.freeze({
  lebtab: {
    loadColumns: async () => LEBTAB_EXPORT_COLUMNS,
    openRows: (rawConn) => lebtabModel.streamExportRows(rawConn),
  },
  c_zutab: {
    loadColumns: (conn) => czutabModel.findColumnNames(conn),
    openRows: (rawConn) => czutabModel.streamExportRows(rawConn),
  },
});

/** Erlaubte Werte von ?type= (docs/SPEC.md 6.1 #12). */
export const EXPORT_TYPES = Object.freeze(Object.keys(EXPORTS));

/**
 * Liest ?type= — genau 'lebtab' oder 'c_zutab' (keine Umwandlung von Gross-/Kleinschreibung, kein trim).
 * @param {Record<string, unknown>} query req.query
 * @returns {'lebtab'|'c_zutab'}
 * @throws {AppError} 400 VALIDATION_ERROR, wenn type fehlt, mehrfach vorkommt oder unbekannt ist
 */
export function parseExportType(query) {
  const type = query?.type;
  if (typeof type === 'string' && Object.hasOwn(EXPORTS, type)) return type;
  throw new AppError(400, 'VALIDATION_ERROR', 'Ungültige Anfrageparameter', [
    { field: 'type', issue: `muss ${EXPORT_TYPES.join(' oder ')} sein` },
  ]);
}

/**
 * Dateiname des Downloads: <type>_export_YYYY-MM-DD.csv mit dem LOKALEN Datum des Servers (nicht UTC).
 * @param {'lebtab'|'c_zutab'} type
 * @param {Date} [now]
 * @returns {string}
 */
export function exportFilename(type, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${type}_export_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}

/**
 * Schreibt die Tabelle als CSV nach `output`. Haelt EINE Pool-Verbindung fuer die Dauer des Streams und beachtet
 * den Rueckstau von `output` (ein langsamer Client bremst die DB, statt den Speicher zu fuellen).
 * `output` wird nur beschrieben — beenden (end) oder zerstoeren (destroy) ist Sache des Aufrufers.
 * @param {'lebtab'|'c_zutab'} type bereits mit parseExportType geprueft
 * @param {import('node:stream').Writable} output
 * @param {() => void} onStart genau einmal, unmittelbar vor dem ersten Byte — der Aufrufer setzt dann Status + Header
 * @returns {Promise<{bytes: number, aborted: boolean}>} aborted: der Empfaenger hat die Verbindung geschlossen
 * @throws DB-Fehler unveraendert. Vor onStart() wurde nichts geschrieben (Aufrufer kann einen JSON-Fehler senden);
 *   danach ist die Datei unvollstaendig und der Aufrufer muss die Verbindung abbrechen.
 */
export async function streamExport(type, output, onStart) {
  const { loadColumns, openRows } = EXPORTS[type];
  const startedAt = Date.now();
  const conn = await pool.getConnection();
  const abort = new AbortController();
  const onClose = () => abort.abort();
  output.once('close', onClose);
  if (output.destroyed) abort.abort(); // Client schon weg, bevor die Verbindung da war: 'close' kommt nicht mehr
  let bytes = 0;
  let started = false;
  let completed = false;
  // mysql2 meldet einen Verbindungsverlust (PROTOCOL_CONNECTION_LOST, ECONNRESET) NICHT im Zeilen-Stream einer Query
  // ohne Callback, sondern nur als 'error' auf der Verbindung — der Stream bliebe sonst fuer immer stumm und der
  // Download haengt. Deshalb den Fehler selbst in den Stream tragen; 'on' statt 'once', damit auch ein zweiter
  // Fehler nicht als unhandled 'error' den Prozess beendet.
  let rows = null;
  const onConnError = (err) => rows?.destroy(err);
  conn.connection.on('error', onConnError);
  try {
    const columns = await loadColumns(conn); // c_zutab: kurze Abfrage auf derselben Verbindung
    rows = openRows(conn.connection);
    await pipeline(
      rows,
      createCsvStream(columns),
      // `signal` kommt von pipeline: abgebrochen, wenn der Client geht (abort) ODER ein Stream davor stirbt (DB-Fehler) —
      // sonst hinge ein Export, der gerade auf einen gestauten Client wartet, trotz totem Zeilen-Stream fuer immer.
      async (chunks, { signal }) => {
        for await (const chunk of chunks) {
          if (!started) {
            started = true;
            onStart();
          }
          bytes += chunk.length;
          if (!output.write(chunk)) await once(output, 'drain', { signal });
        }
      },
      { signal: abort.signal },
    );
    completed = true;
    logger.info('CSV-Export', { type, bytes, ms: Date.now() - startedAt });
    return { bytes, aborted: false };
  } catch (err) {
    if (abort.signal.aborted) {
      logger.info('CSV-Export vom Client abgebrochen', { type, bytes });
      return { bytes, aborted: true };
    }
    if (started) {
      logger.error('CSV-Export abgebrochen', { type, bytes, code: err.code ?? err.message });
    }
    throw err;
  } finally {
    output.off('close', onClose);
    conn.connection.off('error', onConnError);
    // Nur eine vollstaendig gelesene Verbindung darf zurueck in den Pool; sonst haengt noch ein Ergebnis daran.
    if (completed) conn.release();
    else conn.destroy();
  }
}
