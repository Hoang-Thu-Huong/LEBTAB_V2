import { $, escapeHtml, setBusy } from '../../utils/dom.js';
import { parseDecimal } from '../../utils/format.js';
import { itemartLabel } from '../../utils/ingredients.js';
import { validateMengeText } from '../../utils/validators.js';
import {
  rowLabel,
  toEditorRows,
  splitIngredientResponse,
  deleteDialogLines,
  duplicateDialogLines,
} from '../../utils/ingredientEdit.js';
import {
  MIN_TERM_LENGTH,
  renderIngredientPicker,
  renderPickerResults,
  showPickerMessage,
  clearPicker,
} from '../../components/ingredientPicker.js';
import {
  renderIngredientTable,
  updateIngredientSum,
  setIngredientRowError,
} from '../../components/ingredientTable.js';
import { renderStaleBanner } from '../../components/staleBanner.js';
import { confirmDialog } from '../../components/confirmDialog.js';
import { showError, showSuccess, clearMessage } from '../../components/message.js';

// Zweig B von edit.html (docs/ARCHITECTURE.md 7.5): jede Zeile sofort per API, NIE neu berechnen (docs/SPEC.md 5.2).
// Ruft nie api.* auf — alles laeuft ueber die handlers der Seite (edit.js), die api aufruft und state.product pflegt.
const SEARCH_DEBOUNCE_MS = 300;

const state = {
  rows: [], // IngredientRow + mengeText
  stale: 0,
  canDelete: true,
  pendingAdd: null, // { LM_Zutat, zutat, mengeText }
  searchSeq: 0,
  searchTimer: null,
  adding: false,
};
let handlers = {};
/** Die 5 Bereiche des Editors — einmal nach dem Zeichnen erfasst. Nicht per Klasse suchen: message.js
 * show() ersetzt container.className, danach traefe '.editor__message' nicht mehr. */
const el = { banner: null, picker: null, pending: null, message: null, table: null };
const addButton = () => el.pending.querySelector('[data-action="add"]');

/**
 * Zeichnet Banner, Zutaten-Suche, Zeile "neue Zutat" und Tabelle (mode 'remote') EINMAL; danach nur Teil-Updates.
 * @param {HTMLElement} container
 * @param {{ingredients: object[], stale: number, canDelete: boolean}} props ingredients = IngredientRow[] (API #2)
 * @param {{onSearch: (term: string) => Promise<{items: object[], total: number}>,
 *   onAdd: (payload: {LM_Zutat: string, Menge: number, confirmDuplicate: boolean}) => Promise<object>,
 *   onUpdate: (id: number, Menge: number) => Promise<object>,
 *   onDelete: (id: number) => Promise<object>}} h
 */
export function renderIngredientEditor(container, { ingredients, stale, canDelete }, h) {
  handlers = h;
  state.rows = toEditorRows(ingredients);
  state.stale = stale;
  state.canDelete = canDelete;
  state.pendingAdd = null;
  container.innerHTML = `<div class="editor__banner" hidden></div>
    <div class="editor__picker picker"></div>
    <div class="editor__pending" hidden></div>
    <div class="editor__message message" hidden></div>
    <div class="editor__table"></div>`;
  for (const key of Object.keys(el)) el[key] = $(`.editor__${key}`, container);
  renderStaleBanner(el.banner, { stale: state.stale });
  renderIngredientPicker(el.picker, {}, { onSearch: search, onPick: pick });
  renderTable();
}

/**
 * Nach einer Aenderung von aussen (Phase 8: recalculate liefert die aktuelle Rezeptur) Tabelle + Banner neu zeichnen.
 * @param {{ingredients: object[], stale: number}} props
 */
export function updateIngredientEditor({ ingredients, stale }) {
  state.rows = toEditorRows(ingredients);
  state.stale = stale;
  renderTable();
  renderStaleBanner(el.banner, { stale: state.stale });
}

function renderTable() {
  renderIngredientTable(
    el.table,
    { rows: state.rows, mode: 'remote', canDelete: state.canDelete },
    { onMengeInput: mengeInput, onMengeCommit: mengeCommit, onRemove: remove },
  );
}

function markStale(stale) {
  state.stale = stale;
  renderStaleBanner(el.banner, { stale });
}

// --- Suche + neue Zeile ------------------------------------------------------------------------------------

/** Laufende Suche verwerfen (Timer + Antwort in der Luft) — vor clearPicker, sonst zeichnet die Antwort die Liste neu. */
function cancelSearch() {
  clearTimeout(state.searchTimer);
  state.searchSeq += 1;
}

function search(term) {
  clearTimeout(state.searchTimer);
  const seq = ++state.searchSeq;
  const query = term.trim();
  showPickerMessage(el.picker, null);
  if (query.length < MIN_TERM_LENGTH) {
    renderPickerResults(el.picker, { status: query ? 'hint' : 'idle' });
    return;
  }
  renderPickerResults(el.picker, { status: 'loading' });
  state.searchTimer = setTimeout(() => runSearch(query, seq), SEARCH_DEBOUNCE_MS);
}

async function runSearch(query, seq) {
  try {
    const { items, total } = await handlers.onSearch(query);
    if (seq !== state.searchSeq) return; // nur die juengste Antwort zaehlt
    renderPickerResults(el.picker, { status: 'done', items, total });
  } catch (err) {
    if (seq === state.searchSeq) renderPickerResults(el.picker, { status: 'error', error: err });
  }
}

// Auswahl -> Zeile "neue Zutat" mit Menge-Feld; erst "Hinzufügen" ruft die API (Menge ist Pflicht im Body von #7).
function pick(item) {
  state.pendingAdd = {
    LM_Zutat: item.lebtab_lmc,
    zutat: { lebtab_Bezeich: item.lebtab_Bezeich, lebtab_Itemart: item.lebtab_Itemart },
    mengeText: '',
  };
  cancelSearch();
  clearPicker(el.picker);
  renderPending();
  el.pending.querySelector('.pending__menge')?.focus();
}

function renderPending() {
  const box = el.pending;
  const pending = state.pendingAdd;
  if (!pending) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const tag = itemartLabel(pending.zutat.lebtab_Itemart);
  box.innerHTML = `<div class="pending">
      <span class="code">${escapeHtml(pending.LM_Zutat)}</span>
      <span class="pending__name">${escapeHtml(pending.zutat.lebtab_Bezeich)}</span>
      <span class="tag">${escapeHtml(tag)}</span>
      <label class="field pending__field"><span class="field__label">Menge (g)</span>
        <input class="input input--menge pending__menge" type="text" inputmode="decimal" autocomplete="off"
          value="${escapeHtml(pending.mengeText)}">
        <span class="field__error" hidden></span></label>
      <button type="button" class="btn btn--primary btn--small" data-action="add">Hinzufügen</button>
      <button type="button" class="btn btn--small" data-action="cancel">Abbrechen</button>
    </div>`;
  box.hidden = false;
  box.oninput = (ev) => {
    if (ev.target.closest('.pending__menge')) {
      pending.mengeText = ev.target.value;
      setPendingError(null);
    }
  };
  box.onkeydown = (ev) => {
    if (ev.key === 'Enter' && ev.target.closest('.pending__menge')) {
      ev.preventDefault();
      submitPending(false);
    }
  };
  box.onclick = (ev) => {
    const button = ev.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'add') submitPending(false);
    else {
      state.pendingAdd = null;
      renderPending();
    }
  };
}

function setPendingError(issue) {
  const input = el.pending.querySelector('.pending__menge');
  if (!input) return;
  input.classList.toggle('is-invalid', Boolean(issue));
  const note = el.pending.querySelector('.field__error');
  note.textContent = issue ?? '';
  note.hidden = !issue;
}

async function submitPending(confirmDuplicate) {
  const pending = state.pendingAdd;
  if (!pending || state.adding) return;
  const menge = parseDecimal(pending.mengeText);
  const issue = validateMengeText(pending.mengeText, menge);
  if (issue) {
    setPendingError(issue);
    return;
  }
  clearMessage(el.message);
  state.adding = true;
  setBusy(addButton(), true);
  try {
    const res = await handlers.onAdd({ LM_Zutat: pending.LM_Zutat, Menge: menge, confirmDuplicate });
    if (res.warning === 'DUPLICATE_INGREDIENT') {
      state.adding = false; // addButton() ist nach "Abbrechen" null
      if (addButton()) setBusy(addButton(), false);
      if (state.pendingAdd === pending) await askDuplicate(pending, res.existing); // SPEC 5.3; nicht nach Abbrechen
      return;
    }
    const { row, stale } = splitIngredientResponse(res);
    state.rows.push(toEditorRows([row])[0]);
    state.pendingAdd = null;
    renderPending();
    renderTable();
    markStale(stale);
    showSuccess(el.message, `${rowLabel(row)} hinzugefügt`);
  } catch (err) {
    if (err.code === 'INGREDIENT_NOT_FOUND' || err.code === 'VALIDATION_ERROR') {
      setPendingError(err.details?.[0]?.issue ?? err.message);
    } else showError(el.message, err);
  } finally {
    state.adding = false;
    if (addButton()) setBusy(addButton(), false);
  }
}

async function askDuplicate(pending, existing) {
  const confirmed = await confirmDialog({
    title: 'Zutat bereits enthalten',
    lines: duplicateDialogLines(pending, existing),
    confirmLabel: 'Trotzdem hinzufügen',
  });
  if (confirmed && state.pendingAdd === pending) await submitPending(true);
}

// --- Menge aendern (sofort beim Verlassen des Felds) ---------------------------------------------------------

function mengeInput(id, text) {
  const row = state.rows.find((r) => r.id === id);
  if (!row) return;
  row.mengeText = text;
  // Regel 4 (docs/ARCHITECTURE.md 3.3): nur die Summe, mit dem getippten Wert; gespeichert ist noch der alte
  const preview = state.rows.map((r) => ({ ...r, Menge: parseDecimal(r.mengeText) }));
  updateIngredientSum(el.table, preview);
}

async function mengeCommit(id, text) {
  const row = state.rows.find((r) => r.id === id);
  if (!row) return;
  const menge = parseDecimal(text);
  const issue = validateMengeText(text, menge);
  setIngredientRowError(el.table, id, issue);
  if (issue || menge === (row.requested ?? row.Menge)) return; // ungueltig/unveraendert (auch vs. laufenden PUT)
  row.requested = menge;
  row.saving = (row.saving ?? Promise.resolve()).then(() => saveMenge(row, menge)); // je Zeile nacheinander
  await row.saving;
}

async function saveMenge(row, menge) {
  clearMessage(el.message);
  try {
    const { row: saved, stale } = splitIngredientResponse(await handlers.onUpdate(row.id, menge));
    row.Menge = saved.Menge; // Summe danach aus dem Zustand (Tabelle evtl. neu gezeichnet)
    updateIngredientSum(el.table, state.rows);
    markStale(stale);
    showSuccess(el.message, `Menge von ${rowLabel(row)} gespeichert`);
  } catch (err) {
    setIngredientRowError(el.table, row.id, err.details?.[0]?.issue ?? err.message);
    if (err.code !== 'VALIDATION_ERROR') showError(el.message, err);
  } finally { if (row.requested === menge) row.requested = undefined; }
}

// --- Loeschen (Invariante 2: Rueckfrage vor jedem API-Aufruf, docs/SPEC.md 5.9) -----------------------------

async function remove(id) {
  const row = state.rows.find((r) => r.id === id);
  if (!row) return;
  const confirmed = await confirmDialog({
    title: 'Zutat löschen?',
    lines: deleteDialogLines(row),
    confirmLabel: 'Löschen',
    danger: true,
  });
  if (!confirmed) return;
  clearMessage(el.message);
  try {
    const res = await handlers.onDelete(id);
    state.rows = state.rows.filter((r) => r.id !== id);
    renderTable();
    markStale(res.lebtab_nutrition_stale);
    showSuccess(el.message, `${rowLabel(row)} gelöscht (im Archiv)`);
  } catch (err) {
    showError(el.message, err);
  }
}
