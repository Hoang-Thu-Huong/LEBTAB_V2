import { pool } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import * as lebtabModel from '../models/lebtabModel.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/**
 * Wandelt einen Query-Wert in eine ganze Zahl im Bereich [min, max]; undefined/leer -> Default.
 * @param {unknown} value
 * @param {{field: string, def: number, min: number, max?: number}} opts max weglassen = keine Obergrenze
 * @returns {number}
 * @throws {AppError} VALIDATION_ERROR
 */
function toIntInRange(value, { field, def, min, max }) {
  if (value === undefined || value === '') return def;
  const n = Number(value);
  const ok = Number.isInteger(n) && n >= min && (max === undefined || n <= max);
  if (!ok) {
    const issue =
      max === undefined
        ? `muss eine ganze Zahl ab ${min} sein`
        : `muss eine ganze Zahl zwischen ${min} und ${max} sein`;
    throw new AppError(400, 'VALIDATION_ERROR', 'Ungültige Anfrageparameter', [{ field, issue }]);
  }
  return n;
}

/**
 * Produktliste mit Paging (docs/SPEC.md 6.1 #1, Minimalversion: noch ohne Filter).
 * @param {{page?: string|number, pageSize?: string|number}} query
 * @returns {Promise<{items: object[], total: number, page: number, pageSize: number}>}
 */
export async function listProducts(query) {
  const page = toIntInRange(query.page, { field: 'page', def: DEFAULT_PAGE, min: 1 });
  const pageSize = toIntInRange(query.pageSize, {
    field: 'pageSize',
    def: DEFAULT_PAGE_SIZE,
    min: 1,
    max: MAX_PAGE_SIZE,
  });
  const [items, total] = await Promise.all([
    lebtabModel.findPage({ limit: pageSize, offset: (page - 1) * pageSize }, pool),
    lebtabModel.countAll(pool),
  ]);
  return { items, total, page, pageSize };
}
