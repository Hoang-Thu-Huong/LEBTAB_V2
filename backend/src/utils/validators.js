import { ITEMARTS } from './itemarts.js';

/** Produktnummer: genau 6 alphanumerische Zeichen (docs/SPEC.md 5.8, 6.1 #2, 6.4). 100 % der echten Daten. */
export const LMC_PATTERN = /^[A-Za-z0-9]{6}$/;
const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Nur Ziffern, max. 9 Stellen: kein 1e2, 0x10, 1.0, Vorzeichen oder Leerzeichen (DECISIONS #60). */
const INT_PATTERN = /^\d{1,9}$/;

/** @param {unknown} value @returns {boolean} Kein trim — der Wert kommt aus der URL. */
export function isValidLmc(value) {
  return typeof value === 'string' && LMC_PATTERN.test(value);
}

/** @param {unknown} value @returns {boolean} trim(), dann exakter Vergleich — 'v' ist ungueltig (DECISIONS #59). */
export function isValidItemart(value) {
  return typeof value === 'string' && ITEMARTS.includes(value.trim());
}

/** @param {unknown} value @returns {boolean} 'YYYY-MM-DD' UND echtes Kalenderdatum (2020-02-30 -> false). */
export function isValidYmd(value) {
  const m = typeof value === 'string' ? YMD_PATTERN.exec(value) : null;
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1000) return false; // Date.UTC deutet 0..99 als 1900..1999
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** @param {unknown} value @returns {number|null} */
export function parseIntStrict(value) {
  return typeof value === 'string' && INT_PATTERN.test(value) ? Number(value) : null;
}
