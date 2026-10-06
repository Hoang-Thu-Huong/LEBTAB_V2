import { AppError } from './AppError.js';
import { ITEMARTS } from './itemarts.js';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SEARCH_MAX_LENGTH } from './limits.js';
import { isValidYmd, parseIntStrict } from './validators.js';

const FIELDS = ['search', 'itemart', 'datum_from', 'datum_to', 'page', 'pageSize'];

/**
 * Validiert die Query von GET /api/products (docs/SPEC.md 6.1 #1, DECISIONS #54, #59, #60).
 * Sammelt ALLE Verstoesse und wirft dann einmal 400 VALIDATION_ERROR mit details[{field, issue}].
 * @param {Record<string, unknown>} query req.query (Express 5 "simple": string oder string[])
 * @returns {{filters: {search: string|null, itemarts: string[]|null, datumFrom: string|null, datumTo: string|null}, page: number, pageSize: number}}
 * @throws {AppError} 400 VALIDATION_ERROR
 */
export function parseListQuery(query) {
  const details = [];
  const raw = {};
  for (const field of FIELDS) {
    const value = query[field];
    if (value !== undefined && typeof value !== 'string') {
      details.push({ field, issue: 'darf nur einmal angegeben werden' }); // ?search=a&search=b
    } else {
      raw[field] = value;
    }
  }

  const search = (raw.search ?? '').trim();
  if (search.length > SEARCH_MAX_LENGTH) {
    details.push({ field: 'search', issue: `darf höchstens ${SEARCH_MAX_LENGTH} Zeichen haben` });
  }

  let itemarts = null;
  const itemartRaw = (raw.itemart ?? '').trim();
  if (itemartRaw !== '') {
    const parts = itemartRaw.split(',').map((part) => part.trim());
    if (parts.every((part) => ITEMARTS.includes(part))) {
      itemarts = [...new Set(parts)];
    } else {
      details.push({ field: 'itemart', issue: `ungültige Itemart (erlaubt: ${ITEMARTS.join(', ')})` });
    }
  }

  const readDate = (field) => {
    const value = (raw[field] ?? '').trim();
    if (value === '') return null;
    if (isValidYmd(value)) return value;
    details.push({ field, issue: 'muss ein gültiges Datum im Format JJJJ-MM-TT sein' });
    return null;
  };
  const datumFrom = readDate('datum_from');
  const datumTo = readDate('datum_to');
  if (datumFrom && datumTo && datumFrom > datumTo) {
    details.push({ field: 'datum_from', issue: 'darf nicht nach datum_to liegen' });
  }

  const readInt = (field, def, min, max) => {
    const value = raw[field];
    if (value === undefined || value === '') return def;
    const n = parseIntStrict(value);
    if (n !== null && n >= min && (max === undefined || n <= max)) return n;
    const issue =
      max === undefined
        ? `muss eine ganze Zahl ab ${min} sein`
        : `muss eine ganze Zahl zwischen ${min} und ${max} sein`;
    details.push({ field, issue });
    return def;
  };
  const page = readInt('page', DEFAULT_PAGE, 1);
  const pageSize = readInt('pageSize', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  if (details.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Ungültige Anfrageparameter', details);
  }
  return {
    filters: { search: search === '' ? null : search, itemarts, datumFrom, datumTo },
    page,
    pageSize,
  };
}
