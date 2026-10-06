/**
 * SQL fuer Tabelle lebtab. Jede Funktion erhaelt conn (Pool oder Transaktions-Connection) als LETZTEN Parameter
 * (docs/ARCHITECTURE.md 3.2). NIE SELECT * (docs/DATA.md 4.0): physisch heissen 5 Spalten klein.
 * Dynamisch sind nur feste SQL-Fragmente und Spaltenlisten aus Konstanten — Werte immer als ?-Parameter.
 */
import { BASIC_COLUMNS, CLASSIFICATION_COLUMNS, TECHNICAL_COLUMNS } from '../utils/productColumns.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';

const LIST_COLUMNS = 'lebtab_lmc, lebtab_Bezeich, lebtab_Itemart, lebtab_Datum';

/**
 * Macht aus Benutzereingabe ein woertliches LIKE-Muster. Escape-Zeichen '!' statt '\' — unabhaengig von
 * NO_BACKSLASH_ESCAPES (DECISIONS #61). 1.091 Bezeichnungen enthalten '%' (z. B. "3,5%F"), 53 ein '!'.
 * @param {string} term
 * @returns {string}
 */
export function escapeLike(term) {
  return term.replace(/[!%_]/g, '!$&');
}

/**
 * @param {{search: string|null, itemarts: string[]|null, datumFrom: string|null, datumTo: string|null}} filters
 * @returns {{sql: string, params: unknown[]}} sql beginnt mit ' WHERE ...' oder ist leer
 */
function buildWhere({ search, itemarts, datumFrom, datumTo }) {
  const clauses = [];
  const params = [];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    clauses.push("(lebtab_Bezeich LIKE ? ESCAPE '!' OR lebtab_lmc LIKE ? ESCAPE '!')");
    params.push(pattern, pattern);
  }
  if (itemarts && itemarts.length > 0) {
    clauses.push('lebtab_Itemart IN (?)');
    params.push(itemarts);
  }
  if (datumFrom) {
    clauses.push('lebtab_Datum >= ?');
    params.push(datumFrom);
  }
  if (datumTo) {
    clauses.push('lebtab_Datum <= ?');
    params.push(datumTo);
  }
  return { sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

/**
 * Seite der Produktliste, sortiert nach lebtab_lmc (docs/SPEC.md 6.1 #1).
 * @param {{search: string|null, itemarts: string[]|null, datumFrom: string|null, datumTo: string|null}} filters
 * @param {{limit: number, offset: number}} paging
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<Array<{lebtab_lmc: string, lebtab_Bezeich: string, lebtab_Itemart: string, lebtab_Datum: string}>>}
 */
export async function findPage(filters, { limit, offset }, conn) {
  const where = buildWhere(filters);
  const [rows] = await conn.query(
    `SELECT ${LIST_COLUMNS} FROM lebtab${where.sql} ORDER BY lebtab_lmc LIMIT ? OFFSET ?`,
    [...where.params, limit, offset],
  );
  return rows;
}

/**
 * Anzahl der Produkte mit demselben WHERE wie findPage.
 * @param {{search: string|null, itemarts: string[]|null, datumFrom: string|null, datumTo: string|null}} filters
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<number>}
 */
export async function count(filters, conn) {
  const where = buildWhere(filters);
  const [rows] = await conn.query(`SELECT COUNT(*) AS total FROM lebtab${where.sql}`, where.params);
  return Number(rows[0].total);
}

/**
 * Ein Produkt als FLACHE Zeile: 7 Basis- + 6 Klassifikations- + 79 Naehrwertspalten, plus 3 technische Spalten,
 * wenn Migration 001 gelaufen ist. Das Flag kommt vom Service (getSchemaInfo) — das Model kennt schemaInfo nicht.
 * @param {string} lmc
 * @param {{technicalColumns: boolean}} schema
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function findByLmc(lmc, { technicalColumns }, conn) {
  const columns = [
    ...BASIC_COLUMNS,
    ...CLASSIFICATION_COLUMNS,
    ...NUTRITION_COLUMNS,
    ...(technicalColumns ? TECHNICAL_COLUMNS : []),
  ];
  const [rows] = await conn.query(
    `SELECT ${columns.join(', ')} FROM lebtab WHERE lebtab_lmc = ? LIMIT 1`,
    [lmc],
  );
  return rows[0] ?? null;
}

/**
 * Existiert die Produktnummer? (HEAD #2b — ohne die 92 Spalten zu laden.) Kollation _ci: 'abc123' trifft 'ABC123'.
 * @param {string} lmc
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<boolean>}
 */
export async function exists(lmc, conn) {
  const [rows] = await conn.query('SELECT 1 AS found FROM lebtab WHERE lebtab_lmc = ? LIMIT 1', [lmc]);
  return rows.length > 0;
}

/**
 * Naehrwert-Zeilen mehrerer Codes mit EINER Abfrage (kein N+1) — fuer calculateNutrition (docs/SPEC.md 5.1).
 * Liefert auch die Zusatz-Codes (Itemart A): ihre Zeile ist der Marker-Vektor. Kollation _ci: 'afb000' trifft 'AFB000';
 * lebtab_lmc kommt so zurueck, wie es in der DB steht. Leere Liste -> keine Abfrage.
 * @param {string[]} lmcs
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<Array<Record<string, unknown>>>} je Zeile lebtab_lmc, lebtab_Itemart und die 79 Naehrwertspalten
 */
export async function findNutritionByLmcs(lmcs, conn) {
  if (lmcs.length === 0) return [];
  const [rows] = await conn.query(
    `SELECT lebtab_lmc, lebtab_Itemart, ${NUTRITION_COLUMNS.join(', ')} FROM lebtab WHERE lebtab_lmc IN (?)`,
    [lmcs],
  );
  return rows;
}

/**
 * Produktnummer so, wie sie in der DB steht (Kollation _ci: 'a1ck00' trifft 'A1CK00') — fuer den Fotoordner
 * (docs/SPEC.md 5.8). Laedt bewusst nur diese eine Spalte.
 * @param {string} lmc
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<string | null>} null, wenn das Produkt nicht existiert
 */
export async function findStoredLmc(lmc, conn) {
  const [rows] = await conn.query('SELECT lebtab_lmc FROM lebtab WHERE lebtab_lmc = ? LIMIT 1', [
    lmc,
  ]);
  return rows.length > 0 ? rows[0].lebtab_lmc : null;
}
