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
