import { api } from '../api.js';
import { $, getLmcFromUrl } from '../utils/dom.js';
import { canGoBackToList } from '../utils/listParams.js';
import { renderProductInfo } from '../components/productInfo.js';
import { renderNutritionTable } from '../components/nutritionTable.js';
import { renderIngredientTable } from '../components/ingredientTable.js';
import { showError, showLoading, clearMessage } from '../components/message.js';

// Phase 2: nur lesen. Fotos (Phase 4), Stale-Banner (7), Bemerkung (8), Loeschen (9) kommen spaeter dazu —
// deshalb hier bewusst KEIN api.getPhotos (Endpunkt #14 existiert noch nicht).
const state = { lmc: getLmcFromUrl(), product: null, meta: null };

async function load() {
  if (!state.lmc) {
    showError($('#message'), { message: 'Keine Produktnummer angegeben (?lmc= fehlt).' });
    return;
  }
  showLoading($('#message'));
  try {
    [state.product, state.meta] = await Promise.all([api.getProduct(state.lmc), api.getMeta()]);
    clearMessage($('#message'));
    render();
  } catch (err) {
    showError($('#message'), err); // err.message ist bereits Deutsch
  }
}

function render() {
  const p = state.product;
  const title = `${p.lebtab_lmc} — ${p.lebtab_Bezeich}`;
  document.title = `LEBTAB — ${title}`;
  $('#product-title').textContent = title;

  const editLink = $('#btn-edit');
  editLink.href = 'edit.html?lmc=' + encodeURIComponent(p.lebtab_lmc);
  editLink.hidden = !state.meta.features.technicalColumns; // 7.9

  renderProductInfo($('#info'), { product: p });
  renderIngredientTable($('#ingredients'), { rows: p.ingredients, mode: 'readonly' }, {});
  renderNutritionTable($('#nutrition'), { nutrition: p.nutrition, meta: state.meta });
  $('#content').hidden = false;
}

// Kommt der Benutzer aus der Liste, fuehrt "Zurueck" per history.back() dorthin — Filter + Seite bleiben erhalten.
$('#back-link').addEventListener('click', (ev) => {
  if (!canGoBackToList(document.referrer, location.origin, history.length)) return;
  ev.preventDefault();
  history.back();
});

load();
