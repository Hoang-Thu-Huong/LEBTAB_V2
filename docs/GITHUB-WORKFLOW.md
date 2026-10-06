# GitHub Workflow für Lebtab-Projekt

## 🔄 Branch Strategy: Git Flow (Vereinfacht)

```
main (Production)
  ↑
  └── develop (Integration)
      ↑
      ├── feature/... (neue Features)
      ├── bugfix/...  (Bugfixes)
      └── db/...      (Migrationen)
```

---

## 📝 Commit-Konventionen

### Format
```
type(scope): kurze beschreibung

Längere Beschreibung hier bei Bedarf.
```

`scope` ist optional (`backend`, `frontend`, `db` …). Eine Issue-Nummer `(#12)` nur anhängen, wenn es ein Issue gibt.

### Typen

| Typ | Beschreibung | Beispiel |
|-----|-------------|----------|
| `feat:` | Neue Funktionalität | `feat(backend): add GET /api/meta` |
| `fix:` | Bugfix | `fix(frontend): dim the previous list result while the latest request failed` |
| `docs:` | Dokumentation (nur Dateien im Repository, z. B. `README.md`) | `docs: update setup section in README` |
| `db:` | Datenbankänderungen | `db: add migration for row_version` |
| `refactor:` | Code-Umstrukturierung | `refactor: simplify nutrition calculation` |
| `test:` | Tests hinzufügen/ändern | `test: add unit tests for exportColumns` |
| `chore:` | Build, CI/CD, Dependencies | `chore: update package.json` |

### Gute Commits

```bash
# ✅ Gut
git commit -m "feat(frontend): add ingredient duplicate warning dialog"
git commit -m "db: create migration for archive tables"
git commit -m "docs: clarify migration order in README"

# ❌ Vermeiden
git commit -m "bugfix"
git commit -m "update"
git commit -m "wip"
```

---

## 🌿 Branch-Naming

```
feature/[feature-name]
  feature/product-crud
  feature/nutrition-calculation
  feature/walking-skeleton

bugfix/[issue-description]
  bugfix/vietnamese-message-in-docs
  bugfix/duplicate-ingredient-detection

db/[migration-description]
  db/add-row-version-column
  db/create-archive-tables

docs/[topic]
  docs/api-routes
  docs/database-schema
```

---

## 📌 Workflow für eine neue Feature

### 1. Feature-Branch erstellen (von `develop`)
```bash
git checkout develop
git pull origin develop
git checkout -b feature/walking-skeleton
```

### 2. Code schreiben (öfter committen!)
```bash
# Einen logischen Schritt nach dem anderen
git add backend/src/routes/productRoutes.js
git commit -m "feat(backend): add GET /api/products endpoint"

git add frontend/js/pages/list.js
git commit -m "feat(frontend): create product list page"

git add README.md
git commit -m "docs: document new GET endpoint in README"
```

### 3. Mit develop synchronisieren
```bash
git fetch origin
git rebase origin/develop
# Wenn Konflikte: manuell beheben, dann:
git add .
git rebase --continue
```

### 4. Push und Pull Request
```bash
git push origin feature/walking-skeleton
# → GitHub: Gehe zu https://github.com/yourname/lebtab-management
# → "Create Pull Request" Button
```

### 5. Pull Request Beschreibung

```markdown
## 🎯 Beschreibung

Implementiert die "Walking Skeleton" Phase mit:
- GET /api/products Endpoint (fixed LIMIT 20)
- Produktlisten-View im Frontend

## ✅ Checklist

- [x] Code geschrieben und getestet
- [x] Architecture Docs konsultiert
- [x] Commits sind aussagekräftig
- [x] README ggf. aktualisiert
- [x] Keine Umweltsvariablen im Code hart-codiert

## 🔗 Verbundene Issues

Closes #12
Refs #15
```

### 6. Code Review und Merge
```bash
# Nach Approval durch Reviewer:
# → "Squash and merge" Button auf GitHub OR:

git checkout develop
git pull origin develop
git merge --ff-only feature/walking-skeleton
git push origin develop

# Feature-Branch kann dann gelöscht werden
git branch -d feature/walking-skeleton
```

---

## 🗂️ Issues & Project Board

### Issue-Template für Features

```markdown
## 🎯 Feature-Beschreibung

Kurze Zusammenfassung, was implementiert werden soll.

## 📋 Akzeptanzkriterien

- [ ] GET /api/products Endpoint liefert Daten
- [ ] Frontend zeigt Produktliste an
- [ ] Fehlerbehandlung implementiert
- [ ] Tests schreiben (wenn in Phase vorhanden)

## 📚 Referenzen

- Doku: README.md
- Related: #15, #18
```

### Project Board Spalten

```
📋 Backlog → 🏗️ In Development → 👀 Review → ✅ Done
```

---

## 🔍 Code Review Checklist

Vor dem Merge prüfen:

- [ ] Code folgt Sprachkonventionen (Deutsch/English, keine Vietnamesisch)
- [ ] Projektdoku wurde konsultiert (bei Widersprüchen gilt: `DATA.md` > `SPEC.md` > `ARCHITECTURE.md`)
- [ ] Business-Regeln sind befolgt (z.B. recalculateNutrition nicht von Zutat-Endpoints)
- [ ] Keine hart-codierten Umgebungsvariablen
- [ ] .env-Änderungen sind in .env.example dokumentiert
- [ ] DB-Migrationen sind getestet (manuell in phpMyAdmin)
- [ ] Commits sind aussagekräftig, nicht zu groß

---

## 📊 Monitoring

### GitHub Actions (Optional - Zukünftig)

CI/Lint: noch nicht eingerichtet. Es gibt kein `npm run lint`; die Tests laufen lokal mit `cd backend && npm test`. Das folgende Beispiel ist nur ein Entwurf.

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: npm install
      - name: Run linter
        run: npm run lint
      - name: Run tests
        run: npm test
```

---

## 🛡️ Regeln für main-Branch

- **Nur von `develop` mergen** (niemals direkt pushen!)
- **Nur nach erfolgreichem Code Review**
- **Nach Release: Semver Tag erstellen**

```bash
git tag -a v0.1.0 -m "Walking Skeleton Phase"
git push origin v0.1.0
```

---

## 💡 Tipps

1. **Oft pullen**: `git pull origin develop` - verhindert Konflikte
2. **Kleine Branches**: Feature sollte 1-3 Tage dauern
3. **Früh pushen**: Zeige Fortschritt im PR, frag nach Feedback
4. **Lokal testen**: Vor Push immer `npm run dev` & testen
5. **Docs nicht vergessen**: `README.md` bei Feature-Änderungen aktualisieren. Die Projektdoku unter `docs/` (SPEC, DATA, ARCHITECTURE, DECISIONS, OPERATIONS) liegt nur lokal beim Projektinhaber und ist – außer dieser Datei – nicht im Repository

---

## 🚨 Notfall-Hotfix

Wenn ein Bug in `main` gefunden wird:

```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# Bugfix schreiben und testen
git commit -m "fix: critical authentication bug (#99)"

# PR to main (nicht zu develop!)
# Nach Merge: auch zu develop mergen!
git checkout develop
git pull origin develop
git merge main
git push origin develop
```
