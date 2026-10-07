/**
 * Formular-Pruefungen im Frontend (docs/ARCHITECTURE.md 3.3, 7.4). Nur Komfort: das Backend prueft alles erneut
 * (docs/SPEC.md 6.4) und bleibt die Quelle der Wahrheit. Meldungen auf Deutsch, moeglichst wortgleich zum Backend.
 */
import { PRODUCT_INFO_FIELDS } from './productFields.js';

const LMC_PATTERN = /^[A-Za-z0-9]{6}$/;
const INT_PATTERN = /^-?\d{1,10}$/;
const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const INT_MIN = -2147483648; // Spaltentyp INT, gleiche Grenzen wie backend productPayload.js
const INT_MAX = 2147483647;
const INGREDIENT_FIELD_PATTERN = /^ingredients\[(\d+)\]\.(\w+)$/;

export const ISSUE_EMPTY = 'darf nicht leer sein';
export const ISSUE_LMC = 'muss genau 6 Zeichen (A–Z, 0–9) haben';
export const ISSUE_ITEMART = 'ungültige Itemart';
export const ISSUE_INT = 'muss eine ganze Zahl sein';
export const ISSUE_INT_MIN_0 = 'muss eine ganze Zahl ≥ 0 sein';
export const ISSUE_DATE = 'ungültiges Datum';
export const ISSUE_MENGE_MISSING = 'Menge fehlt';
export const ISSUE_MENGE = 'muss eine Zahl ≥ 0 sein';
export const ISSUE_SELF = 'ein Produkt kann nicht seine eigene Zutat sein';

const text = (value) => String(value ?? '').trim();

/** @param {unknown} value @returns {string|null} Meldung oder null, wenn gueltig */
export function validateLmc(value) {
  const lmc = text(value);
  if (lmc === '') return ISSUE_EMPTY;
  return LMC_PATTERN.test(lmc) ? null : ISSUE_LMC;
}

function isRealDate(value) {
  const m = YMD_PATTERN.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Zeichen zaehlen wie MariaDB und das Backend (Codepunkte, nicht UTF-16-Einheiten): ein Emoji = 1 Zeichen. */
function charLength(value) {
  return [...value].length;
}

function validateInt(field, value) {
  if (!INT_PATTERN.test(value) || Number(value) < INT_MIN || Number(value) > INT_MAX) {
    return field.min === 0 ? ISSUE_INT_MIN_0 : ISSUE_INT;
  }
  return field.min === 0 && Number(value) < 0 ? ISSUE_INT_MIN_0 : null;
}

function validateField(field, value, itemarts) {
  if (field.input === 'lmc') return validateLmc(value);
  if (value === '') return field.required ? ISSUE_EMPTY : null;
  if (field.input === 'int') return validateInt(field, value);
  if (field.input === 'date') return isRealDate(value) ? null : ISSUE_DATE;
  if (field.input === 'itemart') return itemarts.length === 0 || itemarts.includes(value) ? null : ISSUE_ITEMART;
  return field.maxLength && charLength(value) > field.maxLength ? `maximal ${field.maxLength} Zeichen` : null;
}

/**
 * Prueft die 13 Stammdaten-Felder.
 * @param {Record<string, string>} form Werte wie in den Eingabefeldern (Strings)
 * @param {string[]} [itemarts] meta.itemarts; leer = Itemart wird nur auf "nicht leer" geprueft
 * @returns {Record<string, string>} key -> Meldung; leeres Objekt = alles gueltig
 */
export function validateProductForm(form, itemarts = []) {
  const errors = {};
  for (const field of PRODUCT_INFO_FIELDS) {
    const issue = validateField(field, text(form[field.key]), itemarts);
    if (issue) errors[field.key] = issue;
  }
  return errors;
}

/**
 * Prueft die lokalen Zutatenzeilen: Menge vorhanden, Zahl >= 0 (0 ist erlaubt), Zutat != Produkt selbst.
 * @param {Array<{tmpId: number, LM_Zutat: string, mengeText: string, Menge: number|null}>} rows
 * @param {string} [lmc] Nummer des Produkts, das gerade angelegt wird
 * @returns {Record<number, string>} tmpId -> Meldung
 */
export function validateIngredients(rows, lmc = '') {
  const errors = {};
  const own = text(lmc).toLowerCase();
  for (const row of rows) {
    if (own !== '' && row.LM_Zutat.toLowerCase() === own) errors[row.tmpId] = ISSUE_SELF;
    else if (text(row.mengeText) === '') errors[row.tmpId] = ISSUE_MENGE_MISSING;
    else if (!Number.isFinite(row.Menge) || row.Menge < 0) errors[row.tmpId] = ISSUE_MENGE;
  }
  return errors;
}

/**
 * Steht der Code schon in der Liste? Ohne Gross-/Kleinschreibung (Kollation _ci, docs/SPEC.md 5.3, 5.4).
 * @template {{LM_Zutat: string}} T
 * @param {T[]} list
 * @param {string} code
 * @returns {T|null} die vorhandene Zeile oder null
 */
export function findDuplicateLmZutat(list, code) {
  const key = text(code).toLowerCase();
  return list.find((row) => row.LM_Zutat.toLowerCase() === key) ?? null;
}

/**
 * Zerlegt details[].field des Backends: 'ingredients[3].Menge' -> { index: 3, key: 'Menge' }, sonst { key }.
 * @param {string} field
 * @returns {{index?: number, key: string}}
 */
export function parseDetailField(field) {
  const m = INGREDIENT_FIELD_PATTERN.exec(field);
  return m ? { index: Number(m[1]), key: m[2] } : { key: field };
}
