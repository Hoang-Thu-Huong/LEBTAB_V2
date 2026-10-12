import { api } from '../api.js';
import { $, getLmcFromUrl } from '../utils/dom.js';
import { canGoBackToList } from '../utils/listParams.js';
import { checkPhotoSelection, uploadSuccessText } from '../utils/photos.js';
import { renderProductInfo } from '../components/productInfo.js';
import { renderNutritionTable } from '../components/nutritionTable.js';
import { renderIngredientTable } from '../components/ingredientTable.js';
import { renderStaleBanner } from '../components/staleBanner.js';
import { renderPhotoGallery } from '../components/photoGallery.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { conflictDialog } from '../components/conflictDialog.js';
import {
  renderBemerkungBox,
  setBemerkungBusy,
  bemerkungMessage,
  setBemerkungText,
} from '../components/bemerkungBox.js';
import { showError, showLoading, showSuccess, clearMessage } from '../components/message.js';

// Phase 4: Fotos. Phase 7: Stale-Banner (nur Warnung — der Button "Neu berechnen" liegt auf edit.html, 7.3).
// Phase 8: Bemerkung (docs/SPEC.md 5.10). Loeschen (Phase 9) kommt spaeter dazu.
const state = { lmc: getLmcFromUrl(), product: null, meta: null, photos: [], photosBusy: false };

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
    return;
  }
  await loadPhotos();
}

function render() {
  const p = state.product;
  const title = `${p.lebtab_lmc} — ${p.lebtab_Bezeich}`;
  document.title = `LEBTAB — ${title}`;
  $('#product-title').textContent = title;

  const editLink = $('#btn-edit');
  editLink.href = 'edit.html?lmc=' + encodeURIComponent(p.lebtab_lmc);
  editLink.hidden = !state.meta.features.technicalColumns; // 7.9

  renderStaleBanner($('#stale'), { stale: p.lebtab_nutrition_stale }); // docs/SPEC.md 5.2: nur Hinweis
  renderProductInfo($('#info'), { product: p });
  renderBemerkungBox(
    $('#bemerkung'),
    {
      text: p.lebtab_bemerkung ?? '',
      readonly: !state.meta.features.technicalColumns,
      maxLength: state.meta.limits.bemerkungMaxLength,
    },
    { onSave: saveBemerkung },
  );
  renderIngredientTable($('#ingredients'), { rows: p.ingredients, mode: 'readonly' }, {});
  renderNutritionTable($('#nutrition'), { nutrition: p.nutrition, meta: state.meta });
  $('#content').hidden = false;
}

// #4 mit nur { lebtab_bemerkung, _row_version } (docs/SPEC.md 5.10). Keine Rueckfrage (5.9); render() wird NICHT
// aufgerufen — das Textfeld bleibt, wie es ist (Regel 4). 409: der getippte Text bleibt (Entscheidung 08/10/2026).
async function saveBemerkung(text) {
  const box = $('#bemerkung');
  clearMessage(bemerkungMessage(box));
  setBemerkungBusy(box, true);
  try {
    const trimmed = text.trim();
    const res = await api.updateProduct(state.product.lebtab_lmc, {
      lebtab_bemerkung: trimmed === '' ? null : trimmed,
      _row_version: state.product._row_version,
    });
    state.product = { ...state.product, ...res }; // #4 liefert keine ingredients — die bisherigen bleiben
    showSuccess(bemerkungMessage(box), 'Bemerkung gespeichert');
  } catch (err) {
    if (err.code !== 'VERSION_CONFLICT') showError(bemerkungMessage(box), err);
    else if (await conflictDialog({ kind: 'bemerkung', current: err.current })) await reloadKeepingBemerkung(text);
    else showError(bemerkungMessage(box), err);
  } finally {
    setBemerkungBusy($('#bemerkung'), false);
  }
}

// "Neu laden" nach 409: Produkt neu laden und zeichnen, danach den getippten Text wieder ins Feld setzen.
async function reloadKeepingBemerkung(text) {
  try {
    state.product = await api.getProduct(state.lmc);
    render();
    setBemerkungText($('#bemerkung'), text, state.meta.limits.bemerkungMaxLength);
  } catch (err) {
    showError($('#message'), err);
  }
}

// Fotos werden NACH dem Produkt und getrennt geladen (DECISIONS #80): ein Fehler im Upload-Verzeichnis
// zeigt nur im Fotos-Bereich eine Meldung, Stammdaten/Zutaten/Naehrwerte bleiben sichtbar.
async function loadPhotos() {
  try {
    state.photos = await api.getPhotos(state.product.lebtab_lmc);
    renderPhotos();
  } catch (err) {
    showError($('#photos-message'), err);
  }
}

// Eigener Render nur fuer den Fotos-Bereich — nie die ganze Seite neu zeichnen (DECISIONS #28).
function renderPhotos() {
  renderPhotoGallery(
    $('#photos'),
    { photos: state.photos, maxPhotos: state.meta.limits.photoMaxPerProduct, busy: state.photosBusy },
    { onUpload: uploadPhotos, onDelete: deletePhoto },
  );
}

// Nach einem Fehler die Liste neu lesen: jemand anderes kann inzwischen hochgeladen oder geloescht haben.
async function refreshPhotos() {
  try {
    state.photos = await api.getPhotos(state.product.lebtab_lmc);
  } catch {
    /* alter Stand bleibt sichtbar; die Fehlermeldung der Aktion steht bereits im Fotos-Bereich */
  }
}

async function uploadPhotos(files) {
  const problem = checkPhotoSelection(files, state.photos.length, state.meta.limits);
  if (problem) {
    showError($('#photos-message'), { message: problem });
    return;
  }
  const formData = new FormData();
  for (const file of files) formData.append('photos', file);
  state.photosBusy = true;
  renderPhotos();
  try {
    state.photos = await api.uploadPhotos(state.product.lebtab_lmc, formData);
    showSuccess($('#photos-message'), uploadSuccessText(files.length));
  } catch (err) {
    showError($('#photos-message'), err);
    await refreshPhotos();
  } finally {
    state.photosBusy = false;
    renderPhotos();
  }
}

async function deletePhoto(filename) {
  // Invariante 2 (docs/SPEC.md 5.9): ohne Bestaetigung kein API-Aufruf. Einzelnes Foto = endgueltig geloescht.
  const confirmed = await confirmDialog({
    title: 'Foto löschen?',
    lines: [filename, 'Das Foto wird endgültig gelöscht und kann nicht wiederhergestellt werden.'],
    confirmLabel: 'Löschen',
    danger: true,
  });
  if (!confirmed) return;
  state.photosBusy = true;
  renderPhotos();
  try {
    await api.deletePhoto(state.product.lebtab_lmc, filename);
    state.photos = state.photos.filter((photo) => photo.filename !== filename);
    showSuccess($('#photos-message'), 'Foto gelöscht');
  } catch (err) {
    showError($('#photos-message'), err);
    await refreshPhotos();
  } finally {
    state.photosBusy = false;
    renderPhotos();
  }
}

// Kommt der Benutzer aus der Liste, fuehrt "Zurueck" per history.back() dorthin — Filter + Seite bleiben erhalten.
$('#back-link').addEventListener('click', (ev) => {
  if (!canGoBackToList(document.referrer, location.origin, history.length)) return;
  ev.preventDefault();
  history.back();
});

load();
