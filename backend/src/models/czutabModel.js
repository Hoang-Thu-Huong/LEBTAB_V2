/**
 * SQL fuer Tabelle c_zutab. conn ist immer der letzte Parameter (docs/ARCHITECTURE.md 3.2).
 */

/**
 * @typedef {{id: number, LMC: string, LM_Zutat: string, Menge: number, Version: number, Anrcode: number,
 *            zutat: {lebtab_Bezeich: string, lebtab_Itemart: string} | null}} IngredientRow
 * @typedef {{id: number, LMC: string, LM_Zutat: string, Menge: number, Version: number, Anrcode: number}} CzutabRow
 */

/** Die 6 Spalten von c_zutab plus Name + Itemart der Zutat (LEFT JOIN, nur 2 Spalten) — docs/SPEC.md 6.1.1. */
const WITH_ZUTAT_SELECT = `SELECT z.id, z.LMC, z.LM_Zutat, z.Menge, z.Version, z.Anrcode,
            l.lebtab_lmc AS zutat_lmc, l.lebtab_Bezeich AS zutat_Bezeich, l.lebtab_Itemart AS zutat_Itemart
       FROM c_zutab z
       LEFT JOIN lebtab l ON l.lebtab_lmc = z.LM_Zutat`;

/** @param {Record<string, unknown>} row @returns {IngredientRow} */
function toIngredientRow(row) {
  return {
    id: row.id,
    LMC: row.LMC,
    LM_Zutat: row.LM_Zutat,
    Menge: row.Menge,
    Version: row.Version,
    Anrcode: row.Anrcode,
    zutat:
      row.zutat_lmc === null
        ? null
        : { lebtab_Bezeich: row.zutat_Bezeich, lebtab_Itemart: row.zutat_Itemart },
  };
}

/**
 * Rezeptur eines Produkts inkl. Name + Itemart der Zutat (LEFT JOIN, nur 2 Spalten) — docs/SPEC.md 6.1.1.
 * zutat === null, wenn LM_Zutat in lebtab nicht existiert (~8 % der Altdaten). Reihenfolge: ORDER BY id.
 * @param {string} lmc
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<IngredientRow[]>}
 */
export async function findByLmcWithZutat(lmc, conn) {
  const [rows] = await conn.query(`${WITH_ZUTAT_SELECT}\n      WHERE z.LMC = ?\n      ORDER BY z.id`, [lmc]);
  return rows.map(toIngredientRow);
}

/**
 * Eine Rezepturzeile als IngredientRow (Antwort von #7 und #8, docs/SPEC.md 6.1.1).
 * @param {number} id
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<IngredientRow | null>}
 */
export async function findByIdWithZutat(id, conn) {
  const [rows] = await conn.query(`${WITH_ZUTAT_SELECT}\n      WHERE z.id = ?\n      LIMIT 1`, [id]);
  return rows.length > 0 ? toIngredientRow(rows[0]) : null;
}

/**
 * Eine Rezepturzeile roh, mit Zeilensperre (FOR UPDATE) — fuer #8/#9 innerhalb einer Transaktion:
 * die Zeile darf sich zwischen Pruefung (gehoert sie zu :lmc?) und UPDATE/DELETE nicht aendern.
 * @param {number} id
 * @param {import('mysql2/promise').PoolConnection} conn Transaktions-Connection
 * @returns {Promise<CzutabRow | null>}
 */
export async function findByIdForUpdate(id, conn) {
  const [rows] = await conn.query(
    'SELECT id, LMC, LM_Zutat, Menge, Version, Anrcode FROM c_zutab WHERE id = ? FOR UPDATE',
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Vorhandene Zeilen desselben Paars (LMC, LM_Zutat) — Grundlage der weichen Dubletten-Warnung (#7, docs/SPEC.md 5.3).
 * Kollation _ci: 'afb000' trifft 'AFB000'. Altdaten koennen mehrere Treffer haben (2.300 doppelte Paare).
 * @param {string} lmc
 * @param {string} lmZutat
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<Array<{id: number, Menge: number}>>} nach id sortiert
 */
export async function findByLmcAndZutat(lmc, lmZutat, conn) {
  const [rows] = await conn.query(
    'SELECT id, Menge FROM c_zutab WHERE LMC = ? AND LM_Zutat = ? ORDER BY id',
    [lmc, lmZutat],
  );
  return rows;
}

/**
 * Anzahl der Rezepturzeilen eines Produkts (Obergrenze INGREDIENT_MAX_PER_PRODUCT beim Hinzufuegen, #7).
 * @param {string} lmc
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<number>}
 */
export async function countByLmc(lmc, conn) {
  const [rows] = await conn.query('SELECT COUNT(*) AS total FROM c_zutab WHERE LMC = ?', [lmc]);
  return Number(rows[0].total);
}

/**
 * Spaltennamen von c_zutab in Tabellenreihenfolge, in der physischen Schreibweise der Tabelle — die Kopfzeile des
 * CSV-Exports (#12). Bewusst nicht fest im Code: der Export liefert c_zutab so, wie die Tabelle ist (DECISIONS #85).
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<string[]>}
 */
export async function findColumnNames(conn) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'c_zutab'
      ORDER BY ORDINAL_POSITION`,
  );
  return rows.map((row) => row.name);
}

/**
 * Alle Rezepturzeilen als Zeilen-Stream fuer den CSV-Export (#12), nach Produkt gruppiert (ORDER BY LMC, id).
 * SELECT * ist hier erlaubt (docs/SPEC.md 6.1 #12): c_zutab wird mit allen Spalten exportiert, die die Tabelle hat —
 * im Gegensatz zu lebtab, wo SELECT * ueberall verboten ist (docs/DATA.md 4.0).
 * Braucht die ROHE Verbindung (PoolConnection.connection), siehe lebtabModel.streamExportRows.
 * @param {import('mysql2').Connection} rawConn
 * @returns {import('node:stream').Readable} objectMode: ein Zeilenobjekt je Rezepturzeile
 */
export function streamExportRows(rawConn) {
  return rawConn.query('SELECT * FROM c_zutab ORDER BY LMC, id').stream();
}

/**
 * Fuegt EINE Rezepturzeile ein (#7). id vergibt AUTO_INCREMENT. Version/Anrcode setzt der Service (docs/DATA.md 4.2).
 * @param {{LMC: string, LM_Zutat: string, Menge: number, Version: number, Anrcode: number}} row
 * @param {import('mysql2/promise').PoolConnection} conn Transaktions-Connection
 * @returns {Promise<number>} neue id
 */
export async function insert(row, conn) {
  const [result] = await conn.query(
    'INSERT INTO c_zutab (LMC, LM_Zutat, Menge, Version, Anrcode) VALUES (?, ?, ?, ?, ?)',
    [row.LMC, row.LM_Zutat, row.Menge, row.Version, row.Anrcode],
  );
  return result.insertId;
}

/**
 * Fuegt Rezepturzeilen in EINER Abfrage ein (Phase 6, docs/SPEC.md 6.1 #3). id vergibt AUTO_INCREMENT in
 * Reihenfolge der Liste. Leere Liste -> keine Abfrage. Version/Anrcode setzt der Service (docs/DATA.md 4.2).
 * @param {Array<{LMC: string, LM_Zutat: string, Menge: number, Version: number, Anrcode: number}>} rows
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn Transaktions-Connection
 * @returns {Promise<number>} Anzahl eingefuegter Zeilen
 */
export async function insertMany(rows, conn) {
  if (rows.length === 0) return 0;
  const values = rows.map((row) => [row.LMC, row.LM_Zutat, row.Menge, row.Version, row.Anrcode]);
  const [result] = await conn.query(
    'INSERT INTO c_zutab (LMC, LM_Zutat, Menge, Version, Anrcode) VALUES ?',
    [values],
  );
  return result.affectedRows;
}

/**
 * Aendert NUR Menge einer Zeile (#8) — LMC, LM_Zutat, Version, Anrcode bleiben unveraendert (docs/SPEC.md 5.7).
 * @param {number} id
 * @param {number} menge
 * @param {import('mysql2/promise').PoolConnection} conn Transaktions-Connection
 * @returns {Promise<number>} affectedRows (0 = Zeile existiert nicht mehr)
 */
export async function updateMenge(id, menge, conn) {
  const [result] = await conn.query('UPDATE c_zutab SET Menge = ? WHERE id = ?', [menge, id]);
  return result.affectedRows;
}

/**
 * Loescht eine Zeile — NUR nach dem Kopieren nach c_zutab_archive in derselben Transaktion (docs/SPEC.md 5.5, #9).
 * @param {number} id
 * @param {import('mysql2/promise').PoolConnection} conn Transaktions-Connection
 * @returns {Promise<number>} affectedRows
 */
export async function deleteById(id, conn) {
  const [result] = await conn.query('DELETE FROM c_zutab WHERE id = ?', [id]);
  return result.affectedRows;
}
