import { AppError } from './AppError.js';
import { ITEMARTS } from './itemarts.js';
import { INGREDIENT_MAX_PER_PRODUCT, MENGE_MAX } from './limits.js';
import { LMC_PATTERN, isValidYmd } from './validators.js';

/**
 * Handgeschriebene Validierung des Bodys von POST /api/products (docs/SPEC.md 6.4, 5.3, 5.4) — kein Joi/zod.
 * Sammelt ALLE Verstoesse und wirft dann einmal 400 VALIDATION_ERROR mit details[{field, issue}].
 * Naehrwertspalten, technische Spalten und unbekannte Schluessel werden ignoriert (nie aus req.body uebernommen).
 */

/** Wertebereich von MariaDB INT (lebtab_Version, lebtab_aktuell, lebtab_lmgruppe, lebtab_probiotisch). */
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const DEFAULT_AKTUELL = 1;

/** Textspalten mit Laenge laut DDL (docs/DATA.md 4.1); required = NOT NULL. */
const TEXT_FIELDS = [
  { key: 'lebtab_Bezeich', maxLength: 255, required: true },
  { key: 'lebtab_Marke', maxLength: 191, required: false },
  { key: 'lebtab_gruppename', maxLength: 100, required: false },
  { key: 'lebtab_source', maxLength: 45, required: false },
  { key: 'lebtab_source_code', maxLength: 45, required: false },
  { key: 'lebtab_source_detail', maxLength: 100, required: false },
];

const ISSUE_EMPTY = 'darf nicht leer sein';
const ISSUE_TEXT = 'muss ein Text sein';
const ISSUE_INT = 'muss eine ganze Zahl sein';
const ISSUE_LMC = 'muss genau 6 Zeichen (A–Z, 0–9) haben';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Zeichen zaehlen wie MariaDB (Codepunkte), nicht UTF-16-Einheiten. */
function charLength(text) {
  return [...text].length;
}

/**
 * Textfeld: trim; leer -> null (bei required -> Fehler); zu lang -> Fehler.
 * @returns {string|null}
 */
function readText(body, { key, maxLength, required }, details) {
  const raw = body[key];
  if (raw === undefined || raw === null) {
    if (required) details.push({ field: key, issue: ISSUE_EMPTY });
    return null;
  }
  if (typeof raw !== 'string') {
    details.push({ field: key, issue: ISSUE_TEXT });
    return null;
  }
  const value = raw.trim();
  if (value === '') {
    if (required) details.push({ field: key, issue: ISSUE_EMPTY });
    return null;
  }
  if (charLength(value) > maxLength) {
    details.push({ field: key, issue: `darf höchstens ${maxLength} Zeichen haben` });
    return null;
  }
  return value;
}

/**
 * Ganzzahl im INT-Bereich oder null. Strings ('3') werden NICHT umgewandelt — JSON kennt Zahlen.
 * @returns {number|null}
 */
function readInt(body, key, details, { min = INT_MIN } = {}) {
  const raw = body[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    details.push({ field: key, issue: ISSUE_INT });
    return null;
  }
  if (raw < min || raw > INT_MAX) {
    details.push({ field: key, issue: `muss eine ganze Zahl zwischen ${min} und ${INT_MAX} sein` });
    return null;
  }
  return raw;
}

function readLmc(body, details) {
  const raw = body.lebtab_lmc;
  if (typeof raw !== 'string' || raw.trim() === '') {
    details.push({ field: 'lebtab_lmc', issue: ISSUE_EMPTY });
    return null;
  }
  const value = raw.trim();
  if (!LMC_PATTERN.test(value)) {
    details.push({ field: 'lebtab_lmc', issue: ISSUE_LMC });
    return null;
  }
  return value.toUpperCase(); // alle 20.315 Bestandscodes sind gross geschrieben (docs/SPEC.md 6.4, DECISIONS #97)
}

function readItemart(body, details) {
  const raw = body.lebtab_Itemart;
  if (typeof raw !== 'string' || raw.trim() === '') {
    details.push({ field: 'lebtab_Itemart', issue: ISSUE_EMPTY });
    return null;
  }
  const value = raw.trim(); // 'V ' -> 'V' (DECISIONS #59); 'v' bleibt ungueltig
  if (!ITEMARTS.includes(value)) {
    details.push({ field: 'lebtab_Itemart', issue: `ungültige Itemart (erlaubt: ${ITEMARTS.join(', ')})` });
    return null;
  }
  return value;
}

function readDatum(body, details) {
  const raw = body.lebtab_Datum;
  if (raw === undefined || raw === null || raw === '') {
    details.push({ field: 'lebtab_Datum', issue: ISSUE_EMPTY });
    return null;
  }
  if (!isValidYmd(raw)) {
    details.push({ field: 'lebtab_Datum', issue: 'muss ein gültiges Datum im Format JJJJ-MM-TT sein' });
    return null;
  }
  return raw;
}

/** lebtab_aktuell: NOT NULL, Default 1 wenn der Schluessel fehlt; explizites null ist ein Fehler (wie bei PUT, 6.4). */
function readAktuell(body, details) {
  if (body.lebtab_aktuell === undefined) return DEFAULT_AKTUELL;
  if (body.lebtab_aktuell === null) {
    details.push({ field: 'lebtab_aktuell', issue: ISSUE_EMPTY });
    return null;
  }
  return readInt(body, 'lebtab_aktuell', details, { min: 0 });
}

/**
 * Eine Rezepturzeile {LM_Zutat, Menge}. Eigenreferenz und Dubletten werden hier hart abgelehnt (docs/SPEC.md 5.3, 5.4);
 * die Existenz der Zutat prueft erst der Service (INGREDIENT_NOT_FOUND).
 */
function readIngredient(item, index, lmcKey, seen, details) {
  const field = (name) => `ingredients[${index}].${name}`;
  if (!isPlainObject(item)) {
    details.push({ field: `ingredients[${index}]`, issue: 'muss ein Objekt mit LM_Zutat und Menge sein' });
    return null;
  }
  let code = null;
  if (typeof item.LM_Zutat !== 'string' || !LMC_PATTERN.test(item.LM_Zutat.trim())) {
    details.push({ field: field('LM_Zutat'), issue: ISSUE_LMC });
  } else {
    code = item.LM_Zutat.trim();
    const key = code.toLowerCase(); // Kollation _ci: ABC123 und abc123 sind derselbe Code
    if (lmcKey !== null && key === lmcKey) {
      details.push({ field: field('LM_Zutat'), issue: 'ein Produkt kann nicht seine eigene Zutat sein' });
    } else if (seen.has(key)) {
      details.push({ field: field('LM_Zutat'), issue: `Zutat doppelt (bereits in Zeile ${seen.get(key) + 1})` });
    } else {
      seen.set(key, index);
    }
  }
  const menge = item.Menge;
  if (typeof menge !== 'number' || !Number.isFinite(menge) || menge < 0 || menge > MENGE_MAX) {
    details.push({ field: field('Menge'), issue: `muss eine Zahl zwischen 0 und ${MENGE_MAX} sein` });
  }
  return code === null ? null : { LM_Zutat: code, Menge: menge };
}

function readIngredients(body, lmc, details) {
  const raw = body.ingredients;
  if (raw === undefined || raw === null) return []; // Rezeptur darf fehlen, null oder leer sein (docs/SPEC.md 6.1 #3)
  if (!Array.isArray(raw)) {
    details.push({ field: 'ingredients', issue: 'muss eine Liste sein' });
    return [];
  }
  if (raw.length > INGREDIENT_MAX_PER_PRODUCT) {
    details.push({ field: 'ingredients', issue: `höchstens ${INGREDIENT_MAX_PER_PRODUCT} Zutaten` });
    return [];
  }
  const lmcKey = lmc === null ? null : lmc.toLowerCase();
  const seen = new Map();
  return raw.map((item, index) => readIngredient(item, index, lmcKey, seen, details));
}

/**
 * @typedef {{lebtab_lmc: string, lebtab_Bezeich: string, lebtab_Marke: string|null, lebtab_Version: number|null,
 *   lebtab_Itemart: string, lebtab_Datum: string, lebtab_aktuell: number, lebtab_lmgruppe: number|null,
 *   lebtab_gruppename: string|null, lebtab_source: string|null, lebtab_source_code: string|null,
 *   lebtab_source_detail: string|null, lebtab_probiotisch: number|null}} ProductInput
 * @typedef {{product: ProductInput, ingredients: Array<{LM_Zutat: string, Menge: number}>}} CreateProductInput
 */

/**
 * Validiert und normalisiert den Body von POST /api/products (docs/SPEC.md 6.1 #3, 6.4).
 * @param {unknown} body req.body (undefined, wenn kein JSON gesendet wurde)
 * @returns {CreateProductInput} 13 Produktspalten (Texte getrimmt, leer -> null) + Rezeptur {LM_Zutat, Menge}
 * @throws {AppError} 400 VALIDATION_ERROR mit allen Verstoessen
 */
export function parseCreateProductBody(body) {
  if (!isPlainObject(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Ungültige Eingabedaten', [
      { field: 'body', issue: 'muss ein JSON-Objekt sein' },
    ]);
  }
  const details = [];
  const lmc = readLmc(body, details);
  const product = {
    lebtab_lmc: lmc,
    lebtab_Bezeich: null,
    lebtab_Marke: null,
    lebtab_Version: readInt(body, 'lebtab_Version', details),
    lebtab_Itemart: readItemart(body, details),
    lebtab_Datum: readDatum(body, details),
    lebtab_aktuell: readAktuell(body, details),
    lebtab_lmgruppe: readInt(body, 'lebtab_lmgruppe', details),
    lebtab_gruppename: null,
    lebtab_source: null,
    lebtab_source_code: null,
    lebtab_source_detail: null,
    lebtab_probiotisch: readInt(body, 'lebtab_probiotisch', details),
  };
  for (const spec of TEXT_FIELDS) product[spec.key] = readText(body, spec, details);
  const ingredients = readIngredients(body, lmc, details);
  if (details.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Ungültige Eingabedaten', details);
  }
  return { product, ingredients };
}
