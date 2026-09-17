/**
 * SQL fuer Tabelle lebtab. Jede Funktion erhaelt conn (Pool oder Transaktions-Connection) als letzten Parameter
 * (docs/ARCHITECTURE.md 3.2). Kein SELECT * — Spalten werden explizit genannt.
 */
const LIST_COLUMNS = 'lebtab_lmc, lebtab_Bezeich, lebtab_Itemart, lebtab_Datum';

/**
 * Seite der Produktliste, sortiert nach lebtab_lmc (docs/SPEC.md 6.1 #1).
 * @param {{limit: number, offset: number}} paging
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<Array<{lebtab_lmc: string, lebtab_Bezeich: string, lebtab_Itemart: string, lebtab_Datum: string}>>}
 */
export async function findPage({ limit, offset }, conn) {
  const [rows] = await conn.query(
    `SELECT ${LIST_COLUMNS} FROM lebtab ORDER BY lebtab_lmc LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows;
}

/**
 * Gesamtzahl der Produkte.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<number>}
 */
export async function countAll(conn) {
  const [rows] = await conn.query('SELECT COUNT(*) AS total FROM lebtab');
  return Number(rows[0].total);
}
