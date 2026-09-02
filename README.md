# Lebensmittel-Produktverwaltungssystem (Lebtab)

**Ein modernes Web-Anwendungssystem zur Verwaltung von Lebensmittelprodukten mit Nährstoffberechnung für deutschsprachiges Personal.**

---

## 📋 Überblick

Dieses Projekt ersetzt direkten Datenbankzugriff durch eine benutzerfreundliche Web-Anwendung für etwa 10 gleichzeitige Benutzer. Das System verwaltet:

- **~20.315 Lebensmittelprodukte** mit 92 Spalten (Nährstoffdaten)
- **~236.962 Zutaten** (Ingredienzen-Zuordnungen)
- **Nährstoffberechnung** basierend auf Zutatenformeln
- **Soft-Delete & Archivierung** für Datenschutz
- **Versionskontrolle** durch optimistic locking

---

## 🛠️ Tech Stack

| Layer | Technologie |
|-------|------------|
| **Frontend** | Vue 3 + Vite (JavaScript) |
| **Backend** | Node.js + Express |
| **Datenbank** | MySQL (XAMPP lokal) |
| **VPN** | Für remote Zugriff |

---

## 📁 Projektstruktur

```
lebtab-management/
├── docs/                          # 7 Architektur-Dokumente (höchste Priorität: context.md)
├── backend/                       # Express.js Server
│   ├── src/
│   │   ├── routes/               # API-Endpoints
│   │   ├── services/             # Business-Logik
│   │   └── utils/
│   │       ├── exportColumns.js   # Spalten-Export-Template
│   │       └── nutritionColumns.js # Nährstoff-Spalten (single source of truth)
│   ├── package.json
│   └── .env.example
├── frontend/                      # Vue 3 + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   ├── views/
│   │   └── App.vue
│   └── package.json
├── db/
│   └── migrations/               # SQL Migrationen
│       ├── 001_alter_lebtab.sql
│       └── 002_create_archive_tables.sql
└── README.md (you are here)
```

---

## ⚙️ Installation & Setup

### Voraussetzungen
- **Node.js** v16+
- **XAMPP** (MySQL)
- **Git**

### Schritt 1: Repository klonen
```bash
git clone https://github.com/yourusername/lebtab-management.git
cd lebtab-management
```

### Schritt 2: Backend-Setup
```bash
cd backend
npm install
cp .env.example .env
# Bearbeite .env mit MySQL-Anmeldedaten
npm start
```

### Schritt 3: Frontend-Setup
```bash
cd ../frontend
npm install
npm run dev
```

### Schritt 4: Datenbank-Migrationen (manuell in phpMyAdmin)
```sql
-- Führe diese Dateien in dieser Reihenfolge aus:
-- db/migrations/001_alter_lebtab.sql
-- db/migrations/002_create_archive_tables.sql
```

---

## 📖 Dokumentation

**Lese diese Dateien in dieser Priorität:**

1. **docs/context.md** ← Höchste Priorität (Quelle der Wahrheit)
2. docs/project-scope.md
3. docs/spec_boundaries.md
4. docs/database-architecture.md
5. docs/backend-architecture.md
6. docs/frontend-architecture.md
7. docs/api-routes-architecture.md

---

## 🚀 Entwicklungs-Phasen

### Phase 1: Walking Skeleton ✅ (Geplant)
- `GET /api/products` (fixed LIMIT 20)
- Einfache Produkt-Listansicht

### Phase 2: Produkt-CRUD
- `POST /api/products` (Produkt erstellen)
- `PUT /api/products/:lmc` (Bearbeiten mit optimistic locking)
- `DELETE /api/products/:lmc` (Soft-Delete)

### Phase 3: Zutat-Management
- `POST /api/products/:lmc/ingredients` (Zutat hinzufügen)
- `PUT /api/products/:lmc/ingredients/:id` (Bearbeiten)
- `DELETE /api/products/:lmc/ingredients/:id` (Löschen)

### Phase 4: Nährstoffberechnung
- `POST /api/products/:lmc/recalculate` (Explizite Neuberechnung)
- `lebtab_nutrition_stale` Flag-Verwaltung

### Phase 5: Archivierung & Export
- Archive/Restore Endpoints
- CSV-Export mit Spalten-Template

---

## ⚠️ Kritische Business-Regeln

> Diese Regeln müssen von allen Entwicklern beachtet werden!

### Nährstoffberechnung
- `recalculateNutrition()` wird **NIEMALS** von Zutat-Endpoints aufgerufen
- Nur `POST /:lmc/recalculate` triggert Neuberechnung
- Zutaten-Endpoints setzen nur `lebtab_nutrition_stale = 1`

### Duplikat-Erkennung (Zutaten)
- **Warnung, kein Fehler!** HTTP 200 + `warning` Feld
- Client kann mit `confirmDuplicate: true` erneut submitten

### 100g-Menge-Check
- **Nur Frontend-Display** (rote Warnung wenn ≠ 100g)
- Keine Backend-Validierung, nicht blockierend

### Vitamin/Spezial-Komponenten
- `itemart = 'A'` wird **ausgeschlossen** aus 100g-Summe
- Aber **gespeichert und angezeigt**
- IngredientPicker: Filter nach `itemart = 'L' OR itemart = 'A'`

### Optimistic Locking
- Nur `PUT /:lmc` und `POST /:lmc/recalculate`
- Nutze `_row_version` Spalte

### CSV-Export
- Verwende **IMMER** `LEBTAB_EXPORT_COLUMNS` aus `backend/src/utils/exportColumns.js`
- Niemals `SELECT *` (würde technische Spalten exportieren)

---

## 🔑 Sprachkonventionen

| Context | Sprache | Beispiel |
|---------|---------|----------|
| Chat (AI) | Vietnamesisch | `tôi muốn...` |
| Code & Variablen | Deutsch/English | `lebtab`, `c_zutab`, `recalculateNutrition` |
| Kommentare | Deutsch/English | `// Nährstoff-Spalten werden hier geladen` |
| API Error Messages | Deutsch | `"Die Produktnummer existiert bereits"` |
| Error Codes | English | `LMC_ALREADY_EXISTS` |
| User-Facing UI | Deutsch | Buttons, Labels, etc. |

---

## 🐛 Bekannte Probleme

- [ ] Vietnamesisches Fehler-Message-Beispiel in `backend-architecture.md` → muss zu Deutsch konvertiert werden
- [ ] Ausstehende DB-Migrationen (müssen vor Phase 2+ manuell in phpMyAdmin ausgeführt werden)

---

## 🤝 Contribution Guide

### Für neue Features:
1. Branch von `develop` erstellen: `git checkout -b feature/feature-name`
2. Architecture Docs **zuerst** konsultieren
3. Code schreiben, testen
4. Pull Request zu `develop` mit Beschreibung
5. Code Review vor Merge

### Commits:
```bash
git commit -m "feat: implement ingredient CRUD endpoints"
git commit -m "docs: update API routes in architecture"
git commit -m "db: add migration for archive tables"
```

---

## 📞 Support & Kontakt

Bei Fragen → konsultiere zuerst `docs/context.md`!

---

## 📄 Lizenz

[Wähle eine: MIT, GPL, Proprietary, etc.]

---

**Letztes Update:** [Datum]  
**Status:** Early Development (Walking Skeleton Phase)
