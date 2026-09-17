/**
 * Anzeige-Formatierung (docs/ARCHITECTURE.md 7.7). Keine Rundung, kein toLocaleString, kein toFixed.
 */
const DASH = '–';
const SALZ_FACTOR = 2.5;
const MG_PER_G = 1000;

/**
 * Wandelt Exponentialschreibweise (1e-7, 1.5e+21) in volle Dezimaldarstellung um.
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
 * Zahl exakt so anzeigen, wie sie in der DB steht. null/undefined/NaN -> '–'.
 * @param {number|string|null|undefined} v
 * @returns {string}
 */
export function formatNumber(v) {
  if (v === null || v === undefined || v === '') return DASH;
  const n = Number(v);
  if (!Number.isFinite(n)) return DASH;
  const s = String(n);
  return /e/i.test(s) ? expandExponent(n) : s;
}

/**
 * Benutzereingabe mit Komma oder Punkt -> number; leer/ungueltig -> null.
 * @param {string|null|undefined} str
 * @returns {number|null}
 */
export function parseDecimal(str) {
  if (str === null || str === undefined) return null;
  const trimmed = String(str).trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * 'YYYY-MM-DD' -> 'DD.MM.YYYY'; alles andere -> '–'.
 * @param {string|null|undefined} ymd
 * @returns {string}
 */
export function formatDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : DASH;
}

/**
 * Salz (g) aus Natrium (mg): NATR * 2.5 / 1000 — nur Anzeige (docs/ARCHITECTURE.md 7.7).
 * @param {number|null|undefined} natrMg
 * @returns {number|null}
 */
export function salzFromNatrium(natrMg) {
  if (natrMg === null || natrMg === undefined) return null;
  const n = Number(natrMg);
  return Number.isFinite(n) ? (n * SALZ_FACTOR) / MG_PER_G : null;
}

/**
 * Heutiges Datum als 'YYYY-MM-DD' in der LOKALEN Zeitzone des Browsers (docs/ARCHITECTURE.md 7.7).
 * Nicht toISOString(): das liefert UTC und springt in Deutschland abends auf den naechsten Tag.
 * @param {Date} [now]
 * @returns {string}
 */
export function todayLocal(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
