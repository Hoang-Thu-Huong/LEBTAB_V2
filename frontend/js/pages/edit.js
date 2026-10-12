import { api } from '../api.js';
import { $, getLmcFromUrl, setBusy } from '../utils/dom.js';
import { splitIngredientResponse } from '../utils/ingredientEdit.js';
import { buildUpdatePayload } from '../utils/productForm.js';
import { recalcSuccessText } from '../utils/recalcPreview.js';
import { renderNutritionTable } from '../components/nutritionTable.js';
import { conflictDialog } from '../components/conflictDialog.js';
import { showError, showLoading, showSuccess, clearMessage } from '../components/message.js';
import { renderInfoForm, isInfoFormChanged } from './edit/infoForm.js';
import { renderIngredientEditor, updateIngredientEditor, setRecalcBusy } from './edit/ingredientEditor.js';
import { runRecalcDialog } from './edit/recalcDialog.js';

// Koordinator von edit.html (docs/ARCHITECTURE.md 7.5): haelt state.product, ruft api, reicht Ergebnisse an die
// Teilmodule — Zweig A Stammdaten (edit/infoForm.js), Zweig B Rezeptur (edit/ingredientEditor.js), Phase 8:
// "Neu berechnen & speichern" (Banner + Karte Naehrwerte, edit/recalcDialog.js) und 409 per conflictDialog.
const SEARCH_PAGE_SIZE = 20;
const MIGRATION_HINT = 'Datenbank-Migration 001 noch nicht ausgeführt';

const state = { lmc: getLmcFromUrl(), product: null, meta: null, recalculating: false };

async function load() {
  if (!state.lmc) {
    showError($('#message'), { message: 'Keine Produktnummer angegeben (?lmc= fehlt).' });
    return;
  }
  $('#back-link').href = 'detail.html?lmc=' + encodeURIComponent(state.lmc); // schon vor dem Laden, auch bei Fehler
  showLoading($('#message'));
  try {
    [state.product, state.meta] = await Promise.all([api.getProduct(state.lmc), api.getMeta()]);
    if (!state.meta.features.technicalColumns) {
      showError($('#message'), { message: MIGRATION_HINT }); // 7.9: ohne Migration 001 kein Bearbeiten
      return;
    }
    clearMessage($('#message'));
    render();
  } catch (err) {
    showError($('#message'), err);
  }
}

function renderTitle() {
  const p = state.product;
  const title = `${p.lebtab_lmc} — ${p.lebtab_Bezeich}`;
  document.title = `LEBTAB — Bearbeiten ${title}`;
  $('#product-title').textContent = title;
  $('#back-link').href = 'detail.html?lmc=' + encodeURIComponent(p.lebtab_lmc);
}

function render() {
  const p = state.product;
  renderTitle();
  renderInfoForm($('#info'), { product: p, itemarts: state.meta.itemarts }, { onSubmit: saveInfo });
  renderIngredientEditor(
    $('#editor'),
    { ingredients: p.ingredients, stale: p.lebtab_nutrition_stale, canDelete: state.meta.features.archive, canRecalculate: true },
    {
      onSearch: searchIngredients,
      onAdd: addIngredient,
      onUpdate: updateIngredient,
      onDelete: deleteIngredient,
      onRecalculate: recalculate,
    },
  );
  renderNutrition();
  clearMessage($('#nutrition-message'));
  $('#btn-recalc').onclick = recalculate;
  $('#content').hidden = false;
}

function renderNutrition() {
  renderNutritionTable($('#nutrition'), { nutrition: state.product.nutrition, meta: state.meta });
}

// --- Zweig A: Stammdaten (#4) --------------------------------------------------------------------------------

// 12 Spalten + _row_version (7.5). 409 -> "Neu laden" laedt die Seite neu (Eingaben weg) und liefert null;
// "Abbrechen" -> Fehler geht an infoForm, das ihn anzeigt; die Eingaben bleiben stehen.
async function saveInfo(form) {
  try {
    const res = await api.updateProduct(state.product.lebtab_lmc, buildUpdatePayload(form, state.product._row_version));
    state.product = { ...state.product, ...res };
    renderTitle();
    return state.product;
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT' && (await conflictDialog({ kind: 'form', current: err.current }))) {
      await load();
      return null;
    }
    throw err;
  }
}

// --- Zweig B: Rezeptur (#7–#9) -------------------------------------------------------------------------------

// Keine Itemart-Filterung (docs/SPEC.md 5.4); das Produkt selbst wird ausgeblendet (Eigenreferenz, 400 im Backend).
async function searchIngredients(term) {
  const data = await api.getProducts({ search: term, pageSize: SEARCH_PAGE_SIZE });
  const own = state.product.lebtab_lmc.toLowerCase();
  const items = data.items.filter((item) => item.lebtab_lmc.toLowerCase() !== own);
  return { items, total: data.total - (data.items.length - items.length) };
}

// #7 — bei DUPLICATE_INGREDIENT (200, warning) bleibt state.product unveraendert; der Editor fragt nach.
async function addIngredient(payload) {
  const res = await api.addIngredient(state.product.lebtab_lmc, payload);
  if (res.warning !== 'DUPLICATE_INGREDIENT') {
    const { row, stale } = splitIngredientResponse(res);
    state.product.ingredients.push(row);
    state.product.lebtab_nutrition_stale = stale;
  }
  return res;
}

// #8 — nur Menge; _row_version bleibt (docs/SPEC.md 5.6)
async function updateIngredient(id, menge) {
  const res = await api.updateIngredient(state.product.lebtab_lmc, id, { Menge: menge });
  const { row, stale } = splitIngredientResponse(res);
  state.product.ingredients = state.product.ingredients.map((r) => (r.id === id ? row : r));
  state.product.lebtab_nutrition_stale = stale;
  return res;
}

// #9 — Soft-Delete mit Archiv
async function deleteIngredient(id) {
  const res = await api.deleteIngredient(state.product.lebtab_lmc, id);
  state.product.ingredients = state.product.ingredients.filter((r) => r.id !== id);
  state.product.lebtab_nutrition_stale = res.lebtab_nutrition_stale;
  return res;
}

// --- Neu berechnen & speichern (#17 Vorschau, #6) ------------------------------------------------------------

function setRecalculating(busy) {
  state.recalculating = busy;
  setRecalcBusy(busy);
  setBusy($('#btn-recalc'), busy);
}

// _row_version = Stand DIESER Seite: hat jemand inzwischen Stammdaten gespeichert, kommt 409 statt still zu ueberschreiben.
async function recalculate() {
  if (state.recalculating) return;
  const lmc = state.product.lebtab_lmc;
  setRecalculating(true);
  clearMessage($('#nutrition-message'));
  try {
    const outcome = await runRecalcDialog(
      { fields: state.meta.nutritionFields },
      {
        loadPreview: () => api.previewRecalculation(lmc),
        save: (preview) => api.recalculate(lmc, state.product._row_version, preview.recipeVersion),
      },
    );
    if (!outcome) return;
    const res = outcome.result;
    Object.assign(state.product, {
      nutrition: res.nutrition,
      lebtab_nutrition_stale: res.lebtab_nutrition_stale,
      _row_version: res._row_version,
      ingredients: res.ingredients, // Rezeptur aus der DB — jemand anderes kann sie geaendert haben (SPEC #6)
    });
    updateIngredientEditor({ ingredients: res.ingredients, stale: res.lebtab_nutrition_stale });
    renderNutrition();
    showSuccess($('#nutrition-message'), recalcSuccessText(outcome.changedCount));
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') {
      const unsavedForm = isInfoFormChanged();
      if (await conflictDialog({ kind: 'recalc', current: err.current, unsavedForm })) await load();
    } else showError($('#nutrition-message'), err);
  } finally {
    setRecalculating(false);
  }
}

// Entscheidung 08/10/2026: Rueckfrage des Browsers, wenn das Stammdaten-Formular ungespeicherte Aenderungen hat.
window.addEventListener('beforeunload', (ev) => {
  if (!isInfoFormChanged()) return;
  ev.preventDefault();
  ev.returnValue = '';
});

load();
