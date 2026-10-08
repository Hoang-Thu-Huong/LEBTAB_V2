/**
 * SQL fuer die Archiv-Tabellen (Migration 002, docs/DATA.md 4.4). conn ist immer der letzte Parameter.
 * Phase 7: nur das Archivieren einer einzelnen Rezepturzeile (#9). Produkt-Archiv, Liste und Wiederherstellen
 * (#5, #10, #11) folgen in Phase 9.
 */

/**
 * Kopiert eine c_zutab-Zeile nach c_zutab_archive — mit der ORIGINALEN id (PK bleibt, docs/DATA.md 4.4).
 * deleted_at setzt die DB (DEFAULT CURRENT_TIMESTAMP); deleted_by bleibt NULL (DECISIONS #35, kein Login).
 * @param {{id: number, LMC: string, LM_Zutat: string, Menge: number, Version: number, Anrcode: number}} row
 * @param {number|null} lebtabArchiveId lebtab_archive.archive_id, wenn zusammen mit dem Produkt archiviert; null bei Einzel-Loeschung
 * @param {import('mysql2/promise').PoolConnection} conn Transaktions-Connection
 * @returns {Promise<void>}
 */
export async function insertIngredientArchive(row, lebtabArchiveId, conn) {
  await conn.query(
    `INSERT INTO c_zutab_archive (id, LMC, LM_Zutat, Menge, Version, Anrcode, lebtab_archive_id, deleted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    [row.id, row.LMC, row.LM_Zutat, row.Menge, row.Version, row.Anrcode, lebtabArchiveId],
  );
}
