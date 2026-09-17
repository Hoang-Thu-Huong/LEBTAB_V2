# db/ — Schema-Referenz und Migrationen

> **Zweck:** `schema/` = Kopie der Original-DDL (nur lesen, nie ausführen). `migrations/` = Skripte, die der
> Projektinhaber **manuell** in phpMyAdmin/MySQL-Client ausführt, in nummerierter Reihenfolge. Der Agent führt nie DDL aus
> (`docs/OPERATIONS.md` 4.6). Alle Skripte fügen nur hinzu (`ADD`); es gibt kein Rollback-Skript — Rollback = Backup einspielen.

## Vor jeder Migration
1. Backup: `powershell -File scripts/backup.ps1` (legt `backups/lebtab_new_YYYY-MM-DD_HHmm.zip` an).
2. Server stoppen (`npm run dev` / Dienst), damit `schemaInfo` nach dem Neustart den neuen Stand liest.

## Reihenfolge und Prüfung

| Nr. | Datei | Prüfbefehl danach | Erwartung |
|---|---|---|---|
| 001 | `001_add_technical_columns.sql` | `SHOW COLUMNS FROM lebtab WHERE Field IN ('_row_version','lebtab_nutrition_stale','lebtab_bemerkung');` | 3 Zeilen |
| 002 | `002_create_archive_tables.sql` (nach 001!) | `SHOW TABLES LIKE '%archive';` und `SHOW COLUMNS FROM c_zutab_archive LIKE 'lebtab_archive_id';` | 2 Tabellen, 1 Zeile |
| 003 | `003_add_indexes.sql` (optional) | `SHOW INDEX FROM c_zutab WHERE Key_name = 'idx_czutab_lmc_lmzutat';` | 2 Zeilen (2 Spalten) |

Nach jeder Migration: Server neu starten und `GET /api/meta` → `features.technicalColumns` / `features.archive` prüfen.

## Was ohne Migration läuft
Health, Produktliste, Produktdetails, Meta, Fotos, CSV-Export. Anlegen/Bearbeiten/Neuberechnen/Bemerkung brauchen 001;
Löschen/Archiv/Wiederherstellen brauchen 001 + 002 (`docs/OPERATIONS.md` 4.6).
