# LEBTAB_V2 — Eingabemaske für `lebtab` / `c_zutab`

Interne Web-Anwendung zum Anzeigen, Anlegen, Bearbeiten und Archivieren von Lebensmittelprodukten
(92 Spalten, davon 79 Nährwerte) und ihren Rezepturen (`c_zutab`), inkl. Produktfotos und CSV-Export.

## Dokumentation (Quelle der Wahrheit)

| Frage | Datei |
|---|---|
| Was muss die App tun? Business-Regeln, API-Vertrag, Fehlercodes | [`docs/SPEC.md`](docs/SPEC.md) |
| Welche Daten, welche Invarianten schützen sie? Schema, Archiv, Migrationen | [`docs/DATA.md`](docs/DATA.md) |
| Wie ist der Code aufgebaut? Schichten, Frontend-Regeln, Tests | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Warum wurde so entschieden? | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Betrieb, Migrationen ausführen, Backup, Roadmap | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |

Bei Widersprüchen gilt: `DATA.md` > `SPEC.md` > `ARCHITECTURE.md`.

## Tech Stack

| Schicht | Technologie |
|---|---|
| Backend | Node.js ≥ 18, Express 5 (ESM), `mysql2/promise`, `dotenv`, `multer` |
| Frontend | HTML5 + CSS3 + Vanilla JavaScript (ES-Module) — kein Framework, kein Bundler, kein CDN |
| Datenbank | MariaDB 10.4 (XAMPP), Datenbank `lebtab_new` |
| Tests | Vitest (Unit) + supertest (Contract) |

Ein Prozess: Express liefert `/api/*`, das statische `frontend/` und `/uploads`.

## Projektstruktur

```
LEBTAB_V2/
├── backend/          # Express-Server (server.js, src/{config,routes,controllers,services,models,middlewares,utils})
├── frontend/         # index.html, detail.html, create.html, edit.html, archive.html, css/, js/
├── db/
│   ├── schema/       # Original-DDL (Referenz, nicht ausführen)
│   └── migrations/   # 001 technische Spalten, 002 Archiv-Tabellen, 003 Indizes — manuell ausführen
├── SQL/              # Original-DDL wie vom Projektinhaber geliefert
├── Excel/            # Beispieldaten (nicht im Git)
├── scripts/          # backup.ps1 (mysqldump + uploads), check-schema.sql
└── docs/             # SPEC, DATA, ARCHITECTURE, DECISIONS, OPERATIONS, legacy/, superpowers/plans
```

## Einrichtung (Entwicklung)

Voraussetzungen: Node.js ≥ 18, XAMPP mit laufender MariaDB, Datenbank `lebtab_new` mit importierten
Tabellen `lebtab` und `c_zutab`.

```bash
cd backend
npm install
copy .env.example .env      # Windows; Werte anpassen (DB_PASSWORD, PORT, UPLOAD_DIR)
npm run dev                 # node --watch server.js → http://localhost:3000
npm test                    # Vitest + supertest
```

## Datenbank-Migrationen (manuell, in dieser Reihenfolge)

Vorher Backup: `powershell -File scripts/backup.ps1` (oder `mysqldump -u root lebtab_new > backup_YYYY-MM-DD.sql`)

1. `db/migrations/001_add_technical_columns.sql`
2. `db/migrations/002_create_archive_tables.sql`
3. `db/migrations/003_add_indexes.sql` (optional)

Details und Prüfbefehle: `db/README.md`. Alle Migrationen fügen nur hinzu (`ADD`), keine bestehende Spalte
wird geändert oder gelöscht (`docs/DATA.md` 4.0, `docs/OPERATIONS.md` 4.6). Ohne Migration laufen: Health,
Produktliste, Produktdetails, Meta, Fotos, CSV-Export. Anlegen/Bearbeiten/Löschen benötigen 001 (+002).

## Kritische Regeln (Kurzfassung — Details in `docs/SPEC.md`, `docs/DATA.md`)

- Originaldaten in `lebtab`/`c_zutab` werden nie hart gelöscht; Löschen = Archiv + Wiederherstellung (4.0, 5.5).
- Jedes Löschen, Wiederherstellen und Neuberechnen der Nährwerte fragt den Benutzer per Dialog (5.9).
- Nährwerte werden nur bei `POST /api/products` (Anlegen) und `POST /:lmc/recalculate` berechnet; Zutaten-Endpunkte setzen nur `lebtab_nutrition_stale = 1` (5.2).
- Zutat mit `Itemart = 'A'` geht nicht in die Berechnung und nicht in die 100-g-Summe ein (5.1).
- CSV-Export nutzt immer `LEBTAB_EXPORT_COLUMNS` (92 Spalten), nie `SELECT *` (8.1).
- Zahlen werden unverändert angezeigt, nicht gerundet (7.7).


## Git-Workflow

Siehe `docs/GITHUB-WORKFLOW.md` (Branches `feature/*` von `develop`, Conventional Commits).
