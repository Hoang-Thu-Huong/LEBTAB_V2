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
[TYPE]: [SHORT DESCRIPTION] (#ISSUE_NUMBER)

Längere Beschreibung hier bei Bedarf.
```

### Typen

| Typ | Beschreibung | Beispiel |
|-----|-------------|----------|
| `feat:` | Neue Funktionalität | `feat: implement GET /api/products (#12)` |
| `fix:` | Bugfix | `fix: correct error message in login` |
| `docs:` | Dokumentation | `docs: update architecture.md` |
| `db:` | Datenbankänderungen | `db: add migration for row_version` |
| `refactor:` | Code-Umstrukturierung | `refactor: simplify nutrition calculation` |
| `test:` | Tests hinzufügen/ändern | `test: add unit tests for exportColumns` |
| `chore:` | Build, CI/CD, Dependencies | `chore: update package.json` |

### Gute Commits

```bash
# ✅ Gut
git commit -m "feat: add ingredient duplicate warning dialog (#23)"
git commit -m "db: create migration for archive tables"
git commit -m "docs: clarify optimistic locking in backend-architecture"

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
git add backend/src/routes/products.js
git commit -m "feat: add GET /api/products endpoint"

git add frontend/src/views/ProductList.vue
git commit -m "feat: create product list view"

git add docs/api-routes-architecture.md
git commit -m "docs: document new GET endpoint"
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

- Architecture: docs/backend-architecture.md
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
- [ ] Architecture Docs wurden konsultiert (context.md hat Vorrang!)
- [ ] Business-Regeln sind befolgt (z.B. recalculateNutrition nicht von Zutat-Endpoints)
- [ ] Keine hart-codierten Umgebungsvariablen
- [ ] .env-Änderungen sind in .env.example dokumentiert
- [ ] DB-Migrationen sind getestet (manuell in phpMyAdmin)
- [ ] Commits sind aussagekräftig, nicht zu groß

---

## 📊 Monitoring

### GitHub Actions (Optional - Zukünftig)

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
5. **Docs nicht vergessen**: Architecture Docs bei Feature-Änderungen updaten

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
