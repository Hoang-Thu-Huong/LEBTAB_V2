import { api } from '../api.js';
import { $, setBusy } from '../utils/dom.js';
import { parseDecimal, todayLocal } from '../utils/format.js';
import { emptyProductForm, buildCreatePayload, isFormDirty } from '../utils/productForm.js';
import {
  validateLmc,
  validateProductForm,
  validateIngredients,
  findDuplicateLmZutat,
  parseDetailField,
} from '../utils/validators.js';
import { renderProductForm, applyFormErrors } from '../components/productForm.js';
import {
  renderIngredientPicker,
  renderPickerResults,
  showPickerMessage,
  clearPicker,
  MIN_TERM_LENGTH,
} from '../components/ingredientPicker.js';
import { renderIngredientTable, updateIngredientSum } from '../components/ingredientTable.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { showError, showLoading, clearMessage } from '../components/message.js';

// Neu anlegen (docs/ARCHITECTURE.md 7.4): Rezeptur bleibt lokal, EIN POST beim Speichern; danach detail.html.
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 20;
const LMC_TAKEN = 'existiert bereits';
const MIGRATION_HINT = 'Datenbank-Migration 001 noch nicht ausgeführt';

const today = todayLocal();
const state = {
  form: emptyProductForm(today),
  ingredients: [], // { tmpId, LM_Zutat, mengeText, Menge, zutat }
  nextTmpId: 0,
  errors: {}, // key -> Meldung (Stammdaten)
  rowErrors: {}, // tmpId -> Meldung (Zutaten)
  itemarts: [],
  lmcTaken: null, // LMC, fuer die HEAD #2b "existiert" gemeldet hat
  lmcCheckSeq: 0,
  searchSeq: 0,
  searchTimer: null,
  saving: false,
  saved: false,
};

async function load() {
  showLoading($('#message'));
  try {
    const meta = await api.getMeta();
    state.itemarts = meta.itemarts;
    if (!meta.features.technicalColumns) {
      showError($('#message'), { message: MIGRATION_HINT }); // 7.9: ohne Migration 001 kein Anlegen
      return;
    }
    clearMessage($('#message'));
    render();
  } catch (err) {
    showError($('#message'), err);
  }
}

function render() {
  renderProductForm(
    $('#form'),
    { form: state.form, errors: state.errors, itemarts: state.itemarts },
    { onChange: changeField, onLmcBlur: checkLmc },
  );
  renderIngredientPicker($('#picker'), {}, { onSearch: searchIngredients, onPick: addIngredient });
  renderTable();
  $('#content').hidden = false;
}

function renderTable() {
  renderIngredientTable(
    $('#ingredients'),
    { rows: state.ingredients, mode: 'local', errors: state.rowErrors },
    { onMengeInput: changeMenge, onRemove: removeIngredient },
  );
}

function changeField(key, value) {
  state.form[key] = value;
  if (key === 'lebtab_lmc') state.lmcTaken = null;
  if (state.errors[key]) {
    delete state.errors[key];
    applyFormErrors($('#form'), state.errors);
  }
}

// HEAD #2b nach dem Verlassen des LMC-Felds. Netz-/DB-Fehler blockieren nicht: der POST meldet 409 ohnehin.
async function checkLmc(value) {
  const lmc = value.trim();
  if (validateLmc(lmc)) return;
  const seq = ++state.lmcCheckSeq;
  try {
    const taken = await api.productExists(lmc);
    if (seq !== state.lmcCheckSeq || state.form.lebtab_lmc.trim() !== lmc) return;
    state.lmcTaken = taken ? lmc : null;
    if (taken) state.errors.lebtab_lmc = LMC_TAKEN;
    else delete state.errors.lebtab_lmc;
    applyFormErrors($('#form'), state.errors);
  } catch {
    /* Pruefung nicht moeglich — Entscheidung faellt beim Speichern (409 LMC_ALREADY_EXISTS) */
  }
}

function searchIngredients(term) {
  clearTimeout(state.searchTimer);
  const seq = ++state.searchSeq;
  const query = term.trim();
  showPickerMessage($('#picker'), null);
  if (query.length < MIN_TERM_LENGTH) {
    renderPickerResults($('#picker'), { status: query ? 'hint' : 'idle' });
    return;
  }
  renderPickerResults($('#picker'), { status: 'loading' });
  state.searchTimer = setTimeout(() => runSearch(query, seq), SEARCH_DEBOUNCE_MS);
}

async function runSearch(query, seq) {
  try {
    const data = await api.getProducts({ search: query, pageSize: SEARCH_PAGE_SIZE });
    if (seq !== state.searchSeq) return; // nur die juengste Antwort zaehlt
    const own = state.form.lebtab_lmc.trim().toLowerCase();
    const items = data.items.filter((item) => item.lebtab_lmc.toLowerCase() !== own);
    const total = data.total - (data.items.length - items.length);
    renderPickerResults($('#picker'), { status: 'done', items, total });
  } catch (err) {
    if (seq === state.searchSeq) renderPickerResults($('#picker'), { status: 'error', error: err });
  }
}

/** Laufende Suche verwerfen: ein spaeter Treffer darf die geleerte Liste nicht neu zeichnen. */
function cancelSearch() {
  clearTimeout(state.searchTimer);
  state.searchSeq += 1;
}

function addIngredient(item) {
  if (state.saving) return; // waehrend des POST aendert sich die Zutatenliste nicht (Index = details[].field)
  const existing = findDuplicateLmZutat(state.ingredients, item.lebtab_lmc);
  if (existing) {
    // Harte Sperre ohne Dialog (docs/SPEC.md 5.3: Doppel beim Anlegen)
    showPickerMessage($('#picker'), `${item.lebtab_lmc} ist bereits in der Zutatenliste`);
    return;
  }
  const tmpId = ++state.nextTmpId;
  state.ingredients.push({
    tmpId,
    LM_Zutat: item.lebtab_lmc,
    mengeText: '',
    Menge: null,
    zutat: { lebtab_Bezeich: item.lebtab_Bezeich, lebtab_Itemart: item.lebtab_Itemart },
  });
  cancelSearch();
  clearPicker($('#picker'));
  renderTable();
  $('#ingredients').querySelector(`.input--menge[data-tmp-id="${tmpId}"]`)?.focus();
}

function changeMenge(tmpId, text) {
  const row = state.ingredients.find((r) => r.tmpId === tmpId);
  if (!row) return;
  row.mengeText = text;
  row.Menge = parseDecimal(text);
  delete state.rowErrors[tmpId];
  updateIngredientSum($('#ingredients'), state.ingredients); // Regel 4: Tabelle nicht neu zeichnen
}

// Auch eine noch nicht gespeicherte Zeile wird nur nach Rueckfrage entfernt (Entscheidung 07/10/2026, DECISIONS #92).
async function removeIngredient(tmpId) {
  if (state.saving) return; // siehe addIngredient
  const row = state.ingredients.find((r) => r.tmpId === tmpId);
  if (!row) return;
  const menge = row.mengeText.trim() === '' ? 'Menge noch nicht eingegeben' : `Menge: ${row.mengeText.trim()} g`;
  const confirmed = await confirmDialog({
    title: 'Zutat entfernen?',
    lines: [`${row.LM_Zutat} – ${row.zutat.lebtab_Bezeich}`, menge],
    confirmLabel: 'Entfernen',
    danger: true,
  });
  if (!confirmed) return;
  state.ingredients = state.ingredients.filter((r) => r.tmpId !== tmpId);
  delete state.rowErrors[tmpId];
  renderTable();
}

function showValidation() {
  applyFormErrors($('#form'), state.errors);
  renderTable();
}

/** 400/409 des Backends auf Felder bzw. Zutatenzeilen abbilden (details[].field, docs/SPEC.md 6). */
function applyServerError(err) {
  if (err.code === 'LMC_ALREADY_EXISTS') {
    state.errors.lebtab_lmc = LMC_TAKEN;
    state.lmcTaken = state.form.lebtab_lmc.trim();
  }
  for (const detail of err.details ?? []) {
    const { index, key } = parseDetailField(detail.field);
    if (index !== undefined) {
      const row = state.ingredients[index];
      if (row) state.rowErrors[row.tmpId] = detail.issue;
    } else if (key in state.form) state.errors[key] = detail.issue;
  }
  showValidation();
}

async function save() {
  if (state.saving) return;
  clearMessage($('#message'));
  state.errors = validateProductForm(state.form, state.itemarts);
  const lmc = state.form.lebtab_lmc.trim();
  if (!state.errors.lebtab_lmc && state.lmcTaken === lmc) state.errors.lebtab_lmc = LMC_TAKEN;
  state.rowErrors = validateIngredients(state.ingredients, lmc);
  showValidation();
  if (Object.keys(state.errors).length > 0 || Object.keys(state.rowErrors).length > 0) {
    showError($('#message'), { message: 'Bitte die markierten Felder korrigieren.' });
    return;
  }
  state.saving = true;
  setBusy($('#btn-save'), true);
  try {
    const res = await api.createProduct(buildCreatePayload(state.form, state.ingredients));
    state.saved = true; // Verlassen-Rueckfrage aus
    location.href = 'detail.html?lmc=' + encodeURIComponent(res.lmc);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR' || err.code === 'INGREDIENT_NOT_FOUND' || err.code === 'LMC_ALREADY_EXISTS') {
      applyServerError(err);
    }
    showError($('#message'), err);
    state.saving = false;
    setBusy($('#btn-save'), false);
  }
}

// Entscheidung 06/10/2026: Browser fragt nach, wenn Eingaben verloren gingen (Standarddialog des Browsers).
window.addEventListener('beforeunload', (ev) => {
  if (state.saved || !isFormDirty(state.form, state.ingredients, today)) return;
  ev.preventDefault();
  ev.returnValue = '';
});

$('#btn-save').addEventListener('click', save);
load();
