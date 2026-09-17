-- 001_add_technical_columns.sql — LEBTAB_V2 (docs/DATA.md 4.1)
-- Nur ADD COLUMN. Keine bestehende Spalte wird geaendert oder geloescht (docs/DATA.md 4.0).
-- Vorher: powershell -File scripts/backup.ps1  (oder mysqldump -u root lebtab_new > backup_YYYY-MM-DD.sql)
-- Pruefung danach: SHOW COLUMNS FROM lebtab WHERE Field IN ('_row_version','lebtab_nutrition_stale','lebtab_bemerkung');  -> 3 Zeilen

USE lebtab_new;

ALTER TABLE lebtab
  ADD COLUMN lebtab_nutrition_stale TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = c_zutab geaendert, Naehrwerte noch nicht neu berechnet',
  ADD COLUMN _row_version INT UNSIGNED NOT NULL DEFAULT 1
    COMMENT 'Optimistic-Locking-Zaehler, unabhaengig von lebtab_Version',
  ADD COLUMN lebtab_bemerkung TEXT NULL
    COMMENT 'Freie Bemerkung, fuer alle Benutzer sichtbar (nicht im CSV-Export)';
