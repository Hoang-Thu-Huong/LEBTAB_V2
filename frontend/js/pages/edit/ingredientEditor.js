import { $, setBusy } from '../../utils/dom.js';
import { parseDecimal } from '../../utils/format.js';
import { validateMengeText } from '../../utils/validators.js';
import { rowLabel, toEditorRows, splitIngredientResponse, deleteDialogLines } from '../../utils/ingredientEdit.js';
import {
  renderIngredientTable,
  updateIngredientSum,
  setIngredientRowError,
} from '../../components/ingredientTable.js';
import { renderStaleBanner } from '../../components/staleBanner.js';
import { confirmDialog } from '../../components/confirmDialog.js';
import { showError, showSuccess, clearMessage } from '../../components/message.js';
import { renderIngredientAdd } from './ingredientAdd.js';

// Zweig B von edit.html (docs/ARCHITECTURE.md 7.5): jede Zeile sofort per API, NIE neu berechnen (docs/SPEC.md 5.2).
// Ruft nie api.* auf — alles laeuft ueber die handlers der Seite (edit.js), die api aufruft und state.product pflegt.
// Phase 8: Suche + "neue Zutat" liegen in ingredientAdd.js (DECISIONS #102); der Banner-Button "Neu berechnen &
// speichern" meldet nur onRecalculate — Vorschau, Dialog und Speichern steuert edit.js (recalcDialog.js).
const state = {
  rows: [], // IngredientRow + mengeText
  stale: 0,
  canDelete: true,
  canRecalculate: false,
  recalcBusy: false,
  deleting: new Set(), // ids mit offener Rueckfrage oder laufendem DELETE (DECISIONS #104: kein zweites Archiv/404)
};
let handlers = {};
/** Die 5 Bereiche des Editors — einmal nach dem Zeichnen erfasst. Nicht per Klasse suchen: message.js
 * show() ersetzt container.className, danach traefe '.editor__message' nicht mehr. */
const el = { banner: null, picker: null, pending: null, message: null, table: null };

/**
 * Zeichnet Banner, Zutaten-Suche, Zeile "neue Zutat" und Tabelle (mode 'remote') EINMAL; danach nur Teil-Updates.
 * @param {HTMLElement} container
 * @param {{ingredients: object[], stale: number, canDelete: boolean, canRecalculate?: boolean}} props
 *   ingredients = IngredientRow[] (API #2)
 * @param {{onSearch: (term: string) => Promise<{items: object[], total: number}>,
 *   onAdd: (payload: {LM_Zutat: string, Menge: number, confirmDuplicate: boolean}) => Promise<object>,
 *   onUpdate: (id: number, Menge: number) => Promise<object>,
 *   onDelete: (id: number) => Promise<object>,
 *   onRecalculate?: () => void}} h
 */
export function renderIngredientEditor(container, { ingredients, stale, canDelete, canRecalculate = false }, h) {
  handlers = h;
  state.rows = toEditorRows(ingredients);
  state.stale = stale;
  state.canDelete = canDelete;
  state.canRecalculate = canRecalculate;
  state.deleting.clear();
  container.innerHTML = `<div class="editor__banner" hidden></div>
    <div class="editor__picker picker"></div>
    <div class="editor__pending" hidden></div>
    <div class="editor__message message" hidden></div>
    <div class="editor__table"></div>`;
  for (const key of Object.keys(el)) el[key] = $(`.editor__${key}`, container);
  renderBanner();
  renderIngredientAdd(
    { picker: el.picker, pending: el.pending, message: el.message },
    { onSearch: (term) => handlers.onSearch(term), onAdd: (payload) => handlers.onAdd(payload), onAdded: added },
  );
  renderTable();
}

/**
 * Nach einer Aenderung von aussen (recalculate liefert die aktuelle Rezeptur) Tabelle + Banner neu zeichnen.
 * @param {{ingredients: object[], stale: number}} props
 */
export function updateIngredientEditor({ ingredients, stale }) {
  state.rows = toEditorRows(ingredients);
  state.stale = stale;
  renderTable();
  renderBanner();
}

/**
 * Banner-Button sperren, waehrend edit.js neu berechnet (Vorschau, Dialog, Speichern).
 * @param {boolean} busy
 */
export function setRecalcBusy(busy) {
  state.recalcBusy = busy;
  renderBanner();
}

function renderBanner() {
  renderStaleBanner(
    el.banner,
    { stale: state.stale, canRecalculate: state.canRecalculate, busy: state.recalcBusy },
    { onRecalculate: () => handlers.onRecalculate?.() },
  );
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
  renderBanner();
}

/** ingredientAdd.js meldet eine neu angelegte Zeile (#7). */
function added(row, stale) {
  state.rows.push(toEditorRows([row])[0]);
  renderTable();
  markStale(stale);
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
  } finally {
    if (row.requested === menge) row.requested = undefined;
  }
}

// --- Loeschen (Invariante 2: Rueckfrage vor jedem API-Aufruf, docs/SPEC.md 5.9) -----------------------------

function removeButton(id) {
  return el.table.querySelector(`[data-action="remove"][data-id="${id}"]`);
}

async function remove(id) {
  const row = state.rows.find((r) => r.id === id);
  if (!row || state.deleting.has(id)) return;
  state.deleting.add(id); // ab dem ersten Klick bis zum Ende: Rueckfrage + DELETE genau einmal (DECISIONS #104)
  try {
    const confirmed = await confirmDialog({
      title: 'Zutat löschen?',
      lines: deleteDialogLines(row),
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) return;
    const button = removeButton(id);
    if (button) setBusy(button, true);
    clearMessage(el.message);
    const res = await handlers.onDelete(id);
    state.rows = state.rows.filter((r) => r.id !== id);
    renderTable();
    markStale(res.lebtab_nutrition_stale);
    showSuccess(el.message, `${rowLabel(row)} gelöscht (im Archiv)`);
  } catch (err) {
    showError(el.message, err);
    const button = removeButton(id); // Tabelle kann inzwischen neu gezeichnet sein
    if (button) setBusy(button, false);
  } finally {
    state.deleting.delete(id);
  }
}
