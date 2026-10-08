import { api } from '../api.js';
import { $, getLmcFromUrl } from '../utils/dom.js';
import { splitIngredientResponse } from '../utils/ingredientEdit.js';
import { renderProductInfo } from '../components/productInfo.js';
import { renderIngredientEditor } from './edit/ingredientEditor.js';
import { showError, showLoading, clearMessage } from '../components/message.js';

// Koordinator von edit.html (docs/ARCHITECTURE.md 7.5): haelt state.product, ruft api, reicht Ergebnisse an die
// Teilmodule. Phase 7: nur Zweig B (Rezeptur, pages/edit/ingredientEditor.js); Zweig A (Stammdaten-Formular,
// pages/edit/infoForm.js) und "Neu berechnen & speichern" folgen in Phase 8 — Stammdaten sind hier nur lesbar.
const SEARCH_PAGE_SIZE = 20;
const MIGRATION_HINT = 'Datenbank-Migration 001 noch nicht ausgeführt';

const state = { lmc: getLmcFromUrl(), product: null, meta: null };

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

function render() {
  const p = state.product;
  const title = `${p.lebtab_lmc} — ${p.lebtab_Bezeich}`;
  document.title = `LEBTAB — Bearbeiten ${title}`;
  $('#product-title').textContent = title;
  $('#back-link').href = 'detail.html?lmc=' + encodeURIComponent(p.lebtab_lmc);
  renderProductInfo($('#info'), { product: p });
  renderIngredientEditor(
    $('#editor'),
    { ingredients: p.ingredients, stale: p.lebtab_nutrition_stale, canDelete: state.meta.features.archive },
    { onSearch: searchIngredients, onAdd: addIngredient, onUpdate: updateIngredient, onDelete: deleteIngredient },
  );
  $('#content').hidden = false;
}

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

load();
