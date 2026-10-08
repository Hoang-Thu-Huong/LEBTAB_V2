import { AppError } from './AppError.js';
import { MENGE_MAX } from './limits.js';
import { LMC_PATTERN } from './validators.js';

/**
 * Handgeschriebene Validierung der Bodys von #7 POST …/ingredients und #8 PUT …/ingredients/:id
 * (docs/SPEC.md 6.1, 6.4) — kein Joi/zod. Sammelt alle Verstoesse und wirft einmal 400 VALIDATION_ERROR.
 * Menge < 0 wird hier abgelehnt (DECISIONS #87): Frontend und calculateNutrition sehen nie negative Mengen.
 */

const ISSUE_EMPTY = 'darf nicht leer sein';
const ISSUE_LMC = 'muss genau 6 Zeichen (A–Z, 0–9) haben';
const ISSUE_NUMBER = 'muss eine Zahl sein';
/** Wortlaut aus DECISIONS #87. */
const ISSUE_NEGATIVE = 'muss 0 oder größer sein';
const ISSUE_TOO_LARGE = `darf höchstens ${MENGE_MAX} sein`;
const ISSUE_BOOLEAN = 'muss true oder false sein';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(details) {
  return new AppError(400, 'VALIDATION_ERROR', 'Ungültige Eingabedaten', details);
}

function requireObject(body) {
  if (!isPlainObject(body)) throw invalid([{ field: 'body', issue: 'muss ein JSON-Objekt sein' }]);
}

/**
 * Menge: number (kein String), endlich, 0 <= Menge <= MENGE_MAX. 0 ist erlaubt (DECISIONS #48).
 * @returns {number|null} null bei Fehler (details wurden ergaenzt)
 */
function readMenge(body, details) {
  const raw = body.Menge;
  if (raw === undefined || raw === null || raw === '') {
    details.push({ field: 'Menge', issue: ISSUE_EMPTY });
    return null;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    details.push({ field: 'Menge', issue: ISSUE_NUMBER });
    return null;
  }
  if (raw < 0) {
    details.push({ field: 'Menge', issue: ISSUE_NEGATIVE });
    return null;
  }
  if (raw > MENGE_MAX) {
    details.push({ field: 'Menge', issue: ISSUE_TOO_LARGE });
    return null;
  }
  return raw;
}

function readLmZutat(body, details) {
  const raw = body.LM_Zutat;
  if (typeof raw !== 'string' || raw.trim() === '') {
    details.push({ field: 'LM_Zutat', issue: ISSUE_EMPTY });
    return null;
  }
  const value = raw.trim();
  if (!LMC_PATTERN.test(value)) {
    details.push({ field: 'LM_Zutat', issue: ISSUE_LMC });
    return null;
  }
  return value;
}

/** confirmDuplicate: fehlt -> false; sonst muss es ein Boolean sein (kein 'true' als String, keine 1). */
function readConfirmDuplicate(body, details) {
  const raw = body.confirmDuplicate;
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== 'boolean') {
    details.push({ field: 'confirmDuplicate', issue: ISSUE_BOOLEAN });
    return false;
  }
  return raw;
}

/**
 * @typedef {{LM_Zutat: string, Menge: number, confirmDuplicate: boolean}} AddIngredientInput
 * @typedef {{Menge: number}} UpdateIngredientInput
 */

/**
 * Validiert den Body von #7 POST /api/products/:lmc/ingredients.
 * Eigenreferenz (LM_Zutat = :lmc) und Existenz der Zutat prueft der Service — er kennt :lmc und die DB.
 * @param {unknown} body
 * @returns {AddIngredientInput}
 * @throws {AppError} 400 VALIDATION_ERROR mit allen Verstoessen
 */
export function parseAddIngredientBody(body) {
  requireObject(body);
  const details = [];
  const LM_Zutat = readLmZutat(body, details);
  const Menge = readMenge(body, details);
  const confirmDuplicate = readConfirmDuplicate(body, details);
  if (details.length > 0) throw invalid(details);
  return { LM_Zutat, Menge, confirmDuplicate };
}

/**
 * Validiert den Body von #8 PUT /api/products/:lmc/ingredients/:id — nur Menge; LMC/LM_Zutat sind nicht aenderbar
 * (andere Schluessel werden ignoriert, nie uebernommen).
 * @param {unknown} body
 * @returns {UpdateIngredientInput}
 * @throws {AppError} 400 VALIDATION_ERROR
 */
export function parseUpdateIngredientBody(body) {
  requireObject(body);
  const details = [];
  const Menge = readMenge(body, details);
  if (details.length > 0) throw invalid(details);
  return { Menge };
}
