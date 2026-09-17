-- 002_create_archive_tables.sql — LEBTAB_V2 (docs/DATA.md 4.4)
-- NACH 001 ausfuehren: CREATE TABLE ... LIKE lebtab uebernimmt die 3 technischen Spalten.
-- Die ALTER-Befehle unten betreffen NUR die neuen Archiv-Tabellen, nie lebtab/c_zutab.
-- Pruefung danach: SHOW TABLES LIKE '%archive';  -> lebtab_archive, c_zutab_archive
--                  SHOW COLUMNS FROM c_zutab_archive LIKE 'lebtab_archive_id';  -> 1 Zeile

USE lebtab_new;

CREATE TABLE lebtab_archive LIKE lebtab;
ALTER TABLE lebtab_archive
  DROP PRIMARY KEY,
  ADD COLUMN archive_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
  ADD COLUMN deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN deleted_by VARCHAR(100) NULL,
  ADD INDEX idx_lebtab_archive_lmc (lebtab_lmc);

CREATE TABLE c_zutab_archive LIKE c_zutab;
ALTER TABLE c_zutab_archive
  MODIFY id INT UNSIGNED NOT NULL,          -- Original-id behalten, AUTO_INCREMENT entfernen (PK bleibt)
  ADD COLUMN lebtab_archive_id INT UNSIGNED NULL
    COMMENT 'lebtab_archive.archive_id wenn zusammen mit dem Produkt archiviert; NULL bei Einzel-Loeschung',
  ADD COLUMN deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN deleted_by VARCHAR(100) NULL,
  ADD INDEX idx_czutab_archive_parent (lebtab_archive_id);
-- Kein zusaetzlicher Index auf LMC: CREATE TABLE ... LIKE hat idx_zutab_lmc (LMC) bereits uebernommen
-- (geprueft auf der echten DB 10/09/2026, DECISIONS #53).
