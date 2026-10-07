/**
 * SQL fuer Tabelle c_zutab. conn ist immer der letzte Parameter (docs/ARCHITECTURE.md 3.2).
 */

/**
 * @typedef {{id: number, LMC: string, LM_Zutat: string, Menge: number, Version: number, Anrcode: number,
 *            zutat: {lebtab_Bezeich: string, lebtab_Itemart: string} | null}} IngredientRow
 */

/**
 * Rezeptur eines Produkts inkl. Name + Itemart der Zutat (LEFT JOIN, nur 2 Spalten) — docs/SPEC.md 6.1.1.
 * zutat === null, wenn LM_Zutat in lebtab nicht existiert (~8 % der Altdaten). Reihenfolge: ORDER BY id.
 * @param {string} lmc
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<IngredientRow[]>}
 */
export async function findByLmcWithZutat(lmc, conn) {
  const [rows] = await conn.query(
    `SELECT z.id, z.LMC, z.LM_Zutat, z.Menge, z.Version, z.Anrcode,
            l.lebtab_lmc AS zutat_lmc, l.lebtab_Bezeich AS zutat_Bezeich, l.lebtab_Itemart AS zutat_Itemart
       FROM c_zutab z
       LEFT JOIN lebtab l ON l.lebtab_lmc = z.LM_Zutat
      WHERE z.LMC = ?
      ORDER BY z.id`,
    [lmc],
  );
  return rows.map((row) => ({
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
  }));
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
