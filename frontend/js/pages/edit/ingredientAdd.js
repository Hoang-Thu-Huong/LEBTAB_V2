import { escapeHtml, setBusy } from '../../utils/dom.js';
import { parseDecimal } from '../../utils/format.js';
import { itemartLabel } from '../../utils/ingredients.js';
import { validateMengeText } from '../../utils/validators.js';
import { rowLabel, splitIngredientResponse, duplicateDialogLines } from '../../utils/ingredientEdit.js';
import {
  MIN_TERM_LENGTH,
  renderIngredientPicker,
  renderPickerResults,
  showPickerMessage,
  clearPicker,
} from '../../components/ingredientPicker.js';
import { confirmDialog } from '../../components/confirmDialog.js';
import { showError, showSuccess, clearMessage } from '../../components/message.js';

// Teil von Zweig B (docs/ARCHITECTURE.md 7.5): Zutaten-Suche + Zeile "neue Zutat" + Rueckfrage bei Dublette (SPEC 5.3).
// Phase 8 aus ingredientEditor.js herausgeloest (DECISIONS #102: 300-Zeilen-Grenze). Ruft nie api.* auf — onSearch/onAdd
// kommen ueber den Editor von edit.js; eine erfolgreich angelegte Zeile meldet onAdded(row, stale) an den Editor.
const SEARCH_DEBOUNCE_MS = 300;

const state = {
  pendingAdd: null, // { LM_Zutat, zutat, mengeText }
  searchSeq: 0,
  searchTimer: null,
  adding: false,
};
let handlers = {};
/** Bereiche, die der Editor einmal gezeichnet hat — nicht per Klasse suchen (message.js ersetzt className). */
const el = { picker: null, pending: null, message: null };
const addButton = () => el.pending.querySelector('[data-action="add"]');

/**
 * Zeichnet die Zutaten-Suche und setzt die Zeile "neue Zutat" zurueck.
 * @param {{picker: HTMLElement, pending: HTMLElement, message: HTMLElement}} parts vom Editor gezeichnet
 * @param {{onSearch: (term: string) => Promise<{items: object[], total: number}>,
 *   onAdd: (payload: {LM_Zutat: string, Menge: number, confirmDuplicate: boolean}) => Promise<object>,
 *   onAdded: (row: object, stale: number) => void}} h
 */
export function renderIngredientAdd(parts, h) {
  Object.assign(el, parts);
  handlers = h;
  cancelSearch();
  state.pendingAdd = null;
  renderPending();
  renderIngredientPicker(el.picker, {}, { onSearch: search, onPick: pick });
}

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
    state.pendingAdd = null;
    renderPending();
    handlers.onAdded(row, stale);
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
