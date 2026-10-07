/**
 * CSV-Bausteine fuer den Export #12 (docs/SPEC.md 6.1 #12, DECISIONS #3, #84): Trennzeichen ',', Dezimalpunkt,
 * UTF-8 mit BOM, Zeilenende CRLF (RFC 4180). Die Datei enthaelt die DB-Werte woertlich: keine Rundung, kein
 * Excel-Schutz (fuehrende Nullen, '=' am Feldanfang bleiben unveraendert), NULL = leeres Feld.
 */
import { Transform } from 'node:stream';

export const CSV_BOM = String.fromCharCode(0xfeff);
export const CSV_SEPARATOR = ',';
export const CSV_LINE_END = '\r\n';
/** Ab dieser Laenge (Zeichen) gibt der Stream einen Block weiter — haelt die Zahl der Schreibvorgaenge klein. */
export const CSV_CHUNK_SIZE = 64 * 1024;

/** Feld muss in Anfuehrungszeichen: enthaelt " , CR oder LF, oder beginnt/endet mit Leerraum. */
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/**
 * Wandelt Exponentialschreibweise (1e-7, 1.5e+21) in volle Dezimaldarstellung um — derselbe Algorithmus wie
 * frontend/js/utils/format.js (docs/ARCHITECTURE.md 7.7); csvFormatter.test.js vergleicht beide.
 * @param {number} n endliche Zahl
 * @returns {string}
 */
function expandExponent(n) {
  const [mantissa, expStr] = String(n).toLowerCase().split('e');
  const exp = Number(expStr);
  const sign = mantissa.startsWith('-') ? '-' : '';
  const unsigned = mantissa.replace('-', '');
  const digits = unsigned.replace('.', '');
  const intLen = unsigned.split('.')[0].length;
  const pointPos = intLen + exp;
  if (pointPos <= 0) return `${sign}0.${'0'.repeat(-pointPos)}${digits}`;
  if (pointPos >= digits.length) return `${sign}${digits}${'0'.repeat(pointPos - digits.length)}`;
  return `${sign}${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
}

/**
 * Zahl exakt wie gespeichert: Dezimalpunkt, keine Rundung, kein Tausendertrennzeichen, nie Exponentialschreibweise.
 * @param {number} n
 * @returns {string} '' fuer NaN/Infinity (kommen in DOUBLE-Spalten nicht vor)
 */
export function numberToString(n) {
  if (!Number.isFinite(n)) return '';
  const s = String(n);
  return /e/i.test(s) ? expandExponent(n) : s;
}

/**
 * Ein Zellwert -> CSV-Feld. null/undefined -> leeres Feld; leerer String -> "" (unterscheidbar von NULL);
 * Text wird nur bei Bedarf in Anfuehrungszeichen gesetzt, " wird verdoppelt.
 * @param {unknown} value
 * @returns {string}
 */
export function toCsvField(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return numberToString(value);
  const text = String(value);
  if (text === '') return '""';
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * @param {unknown[]} values
 * @returns {string} eine CSV-Zeile inkl. Zeilenende
 */
export function toCsvLine(values) {
  return values.map(toCsvField).join(CSV_SEPARATOR) + CSV_LINE_END;
}

/**
 * Transform: Zeilenobjekte (Schluessel = Spaltennamen) -> CSV-Text. Erste Ausgabe = BOM + Kopfzeile, auch wenn
 * keine einzige Zeile kommt. Spaltenreihenfolge kommt aus `columns`, nicht aus der Reihenfolge der Objektschluessel.
 * Nichts wird im Speicher gesammelt ausser dem aktuellen Block (CSV_CHUNK_SIZE).
 * @param {readonly string[]} columns
 * @returns {import('node:stream').Transform}
 */
export function createCsvStream(columns) {
  let buffer = CSV_BOM + toCsvLine(columns);
  return new Transform({
    writableObjectMode: true,
    readableObjectMode: false,
    transform(row, _encoding, callback) {
      buffer += toCsvLine(columns.map((column) => row[column]));
      if (buffer.length < CSV_CHUNK_SIZE) return callback();
      const chunk = buffer;
      buffer = '';
      return callback(null, chunk);
    },
    flush(callback) {
      callback(null, buffer);
    },
  });
}
