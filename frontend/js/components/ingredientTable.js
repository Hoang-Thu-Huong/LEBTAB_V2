import { escapeHtml } from '../utils/dom.js';
import { DASH, formatNumber } from '../utils/format.js';
import { isZusatz, itemartLabel, summarizeIngredients } from '../utils/ingredients.js';

/** Hinweis bei leerer Rezeptur im Formular (Entscheidung 06/10/2026: Anlegen ohne Zutaten bleibt erlaubt). */
const EMPTY_LOCAL_NOTE = 'Ohne Zutaten bleiben alle Nährwerte leer.';
const EMPTY_REMOTE_NOTE = 'Zutaten über die Suche hinzufügen.';
/** Phase 7: ohne Migration 002 gibt es kein Archiv, also keinen Loesch-Button (docs/ARCHITECTURE.md 7.9). */
const NO_DELETE_NOTE = 'Löschen von Zutaten erst nach Datenbank-Migration 002 möglich.';
/** Schluessel-Attribut der Zeile: Anlegen arbeitet mit tmpId, Bearbeiten mit der c_zutab-id. */
const KEY_ATTR = { local: 'data-tmp-id', remote: 'data-id' };

function codeHtml(row) {
  const code = escapeHtml(row.LM_Zutat);
  return row.zutat !== null
    ? `<a class="link code" href="detail.html?lmc=${escapeHtml(encodeURIComponent(row.LM_Zutat))}">${code}</a>`
    : `<span class="code">${code}</span>`;
}

function nameHtml(row) {
  return row.zutat !== null ? escapeHtml(row.zutat.lebtab_Bezeich) : '<em class="muted">unbekannt</em>';
}

function tagHtml(row) {
  if (row.zutat === null) return DASH;
  return `<span class="tag">${escapeHtml(itemartLabel(row.zutat.lebtab_Itemart))}</span>`;
}

function rowHtml(row) {
  return `<tr class="${isZusatz(row) ? 'table__row--zusatz' : ''}">
    <td>${codeHtml(row)}</td><td>${nameHtml(row)}</td><td>${tagHtml(row)}</td>
    <td class="num">${escapeHtml(formatNumber(row.Menge))}</td>
    <td class="num">${escapeHtml(formatNumber(row.Anrcode))}</td>
  </tr>`;
}

function renderReadonly(container, rows) {
  if (rows.length === 0) {
    container.innerHTML = '<div class="table__empty">Keine Rezeptur hinterlegt.</div>';
    return;
  }
  const { visibleRows, hiddenZeroCount, sum, sumOk } = summarizeIngredients(rows);
  const hiddenNote =
    hiddenZeroCount > 0
      ? `<p class="note muted">${escapeHtml(hiddenZeroCount)} ${hiddenZeroCount === 1 ? 'Zeile' : 'Zeilen'} mit Menge 0 ausgeblendet</p>`
      : '';
  const sumWarn = sumOk ? '' : ' <span class="sum-warn">≠ 100 g</span>';
  container.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Code</th><th>Bezeichnung</th><th>Itemart</th><th class="num">Menge</th><th class="num">Anrcode</th></tr></thead>
      <tbody>${visibleRows.map(rowHtml).join('')}</tbody>
    </table></div>
    <p class="note">Summe der Zutaten (ohne Zusätze):
      <strong id="menge-sum" class="${sumOk ? '' : 'sum-warn'}">${escapeHtml(formatNumber(sum))} g</strong>${sumWarn}</p>
    ${hiddenNote}`;
}

/** Gueltige Menge einer editierbaren Zeile: Zahl >= 0 (leer = noch nicht eingegeben, zaehlt als 0). */
function mengeValid(row) {
  return Number.isFinite(row.Menge) && row.Menge >= 0;
}

/** Nicht-leerer Text, der keine Zahl >= 0 ist ("abc", "-5", "1.000,5"): sofort rot, nicht erst beim Speichern. */
function mengeInvalid(row) {
  return String(row.mengeText ?? '').trim() !== '' && !mengeValid(row);
}

/**
 * Summe der editierbaren Zeilen: leere ODER ungueltige Menge zaehlt als 0, Zeilen mit 0 bleiben sichtbar;
 * sumOk ist false, solange eine Zeile ungueltig ist (die Summe darf dann nicht schwarz "100 g" zeigen).
 */
function editableSummary(rows) {
  const summary = summarizeIngredients(rows.map((row) => ({ ...row, Menge: mengeValid(row) ? row.Menge : 0 })));
  return { ...summary, sumOk: summary.sumOk && !rows.some(mengeInvalid) };
}

/** Zeilenschluessel: tmpId (local) bzw. c_zutab-id (remote). */
function keyOfRow(row, mode) {
  return mode === 'local' ? row.tmpId : row.id;
}

/** Eine editierbare Zeile (local: tmpId, kein Anrcode; remote: id, Anrcode read-only, Loeschen nur mit Archiv). */
function editableRowHtml(row, issue, { mode, canDelete }) {
  const key = `${KEY_ATTR[mode]}="${escapeHtml(keyOfRow(row, mode))}"`;
  const invalid = Boolean(issue) || mengeInvalid(row);
  const anrcode = mode === 'remote' ? `<td class="num">${escapeHtml(formatNumber(row.Anrcode))}</td>` : '';
  const remove = canDelete
    ? `<button type="button" class="btn btn--small" data-action="remove" ${key}>Entfernen</button>`
    : '';
  return `<tr class="${isZusatz(row) ? 'table__row--zusatz' : ''}" ${key}>
    <td>${mode === 'remote' ? codeHtml(row) : `<span class="code">${escapeHtml(row.LM_Zutat)}</span>`}</td>
    <td>${nameHtml(row)}</td>
    <td>${tagHtml(row)}</td>
    <td class="num"><input class="input input--menge ${invalid ? 'is-invalid' : ''}" type="text" inputmode="decimal"
        ${key} value="${escapeHtml(row.mengeText)}" autocomplete="off">
      <span class="field__error" ${issue ? '' : 'hidden'}>${escapeHtml(issue ?? '')}</span></td>
    ${anrcode}<td>${remove}</td>
  </tr>`;
}

function editableEmptyHtml(mode) {
  if (mode === 'local') {
    return `<div class="table__empty">Noch keine Zutaten ausgewählt.</div>
      <p class="note muted">${escapeHtml(EMPTY_LOCAL_NOTE)}</p>`;
  }
  return `<div class="table__empty">Keine Rezeptur hinterlegt.</div>
      <p class="note muted">${escapeHtml(EMPTY_REMOTE_NOTE)}</p>`;
}

function renderEditable(container, rows, errors, options, { onMengeInput, onMengeCommit, onRemove }) {
  const { mode, canDelete } = options;
  const keyOf = (el) => Number(mode === 'local' ? el.dataset.tmpId : el.dataset.id);
  if (rows.length === 0) {
    container.innerHTML = editableEmptyHtml(mode);
  } else {
    const { sum, sumOk } = editableSummary(rows);
    const anrcodeHead = mode === 'remote' ? '<th class="num">Anrcode</th>' : '';
    container.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Code</th><th>Bezeichnung</th><th>Itemart</th><th class="num">Menge (g)</th>${anrcodeHead}<th></th></tr></thead>
      <tbody>${rows.map((row) => editableRowHtml(row, errors[keyOfRow(row, mode)], options)).join('')}</tbody>
    </table></div>
    <p class="note">Summe der Zutaten (ohne Zusätze):
      <strong id="menge-sum" class="${sumOk ? '' : 'sum-warn'}">${escapeHtml(formatNumber(sum))} g</strong>
      <span class="sum-warn sum-warn-note" ${sumOk ? 'hidden' : ''}>≠ 100 g</span></p>
    ${mode === 'remote' && !canDelete ? `<p class="note muted">${escapeHtml(NO_DELETE_NOTE)}</p>` : ''}`;
  }
  container.oninput = (ev) => {
    const input = ev.target.closest('.input--menge');
    if (!input) return;
    // Fehler der Zeile (Rahmen + Text) verschwindet beim Tippen; nur diese Elemente, ohne Neuzeichnen
    input.classList.remove('is-invalid');
    const note = input.closest?.('td')?.querySelector('.field__error');
    if (note) {
      note.textContent = '';
      note.hidden = true;
    }
    onMengeInput(keyOf(input), input.value);
  };
  // remote: Verlassen des Felds (oder Enter -> blur) speichert die Menge sofort (docs/ARCHITECTURE.md 7.5)
  container.onchange = (ev) => {
    const input = ev.target.closest('.input--menge');
    if (input && onMengeCommit) onMengeCommit(keyOf(input), input.value);
  };
  container.onkeydown = (ev) => {
    if (ev.key === 'Enter' && ev.target.closest('.input--menge')) {
      ev.preventDefault();
      ev.target.blur();
    }
  };
  container.onclick = (ev) => {
    const button = ev.target.closest('[data-action="remove"]');
    if (button) onRemove(keyOf(button));
  };
}

/**
 * Zutatentabelle. mode 'readonly' (detail, Phase 2): blendet Menge = 0 aus (+ Hinweis), Summe ohne Zusaetze,
 * leere Rezeptur -> Hinweis ohne Summe (DECISIONS #63). mode 'local' (create, Phase 6): Menge als Eingabefeld,
 * Button "Entfernen", alle Zeilen sichtbar, Fehler je Zeile; Summe per updateIngredientSum ohne Neuzeichnen.
 * mode 'remote' (edit, Phase 7): wie local, aber Zeilen = IngredientRow (id, Anrcode read-only, unbekannte Zutat
 * bleibt editierbar), Menge wird beim Verlassen des Felds gemeldet (onMengeCommit), Entfernen nur mit canDelete.
 * Reine Render-Funktion, kein API-Aufruf.
 * @param {HTMLElement} container
 * @param {{rows: object[], mode?: 'readonly'|'local'|'remote', errors?: Record<number, string>, canDelete?: boolean}} props
 *   local-Zeile: { tmpId, LM_Zutat, mengeText, Menge: number|null, zutat: {lebtab_Bezeich, lebtab_Itemart} }
 *   remote-Zeile: IngredientRow + mengeText (Text im Feld); errors: tmpId bzw. id -> Meldung
 * @param {{onMengeInput?: (key: number, text: string) => void, onMengeCommit?: (key: number, text: string) => void,
 *   onRemove?: (key: number) => void}} [handlers]
 */
export function renderIngredientTable(container, { rows, mode = 'readonly', errors = {}, canDelete = true }, handlers = {}) {
  if (mode === 'readonly') renderReadonly(container, rows);
  else renderEditable(container, rows, errors, { mode, canDelete: mode === 'local' || canDelete }, handlers);
}

/**
 * Nur Summenzeile + Rahmen der Menge-Felder aktualisieren (waehrend der Benutzer eine Menge tippt — Regel 4,
 * docs/ARCHITECTURE.md 3.3): ein Feld mit ungueltigem Text wird sofort rot, ohne die Tabelle neu zu zeichnen.
 * @param {HTMLElement} container
 * @param {object[]} rows editierbare Zeilen aus dem state (Menge: number|null; local: tmpId, remote: id)
 */
export function updateIngredientSum(container, rows) {
  const sumEl = container.querySelector('#menge-sum');
  if (!sumEl) return;
  for (const input of container.querySelectorAll('.input--menge')) {
    const key = input.dataset.tmpId ?? input.dataset.id;
    const row = rows.find((r) => String(r.tmpId ?? r.id) === key);
    if (row) input.classList.toggle('is-invalid', mengeInvalid(row));
  }
  const { sum, sumOk } = editableSummary(rows);
  sumEl.textContent = `${formatNumber(sum)} g`;
  sumEl.classList.toggle('sum-warn', !sumOk);
  container.querySelector('.sum-warn-note').hidden = sumOk;
}

/**
 * Fehlertext unter EINER Menge-Zelle setzen oder entfernen, ohne die Tabelle neu zu zeichnen (mode remote).
 * @param {HTMLElement} container
 * @param {number} id c_zutab-id der Zeile
 * @param {string|null} issue
 */
export function setIngredientRowError(container, id, issue) {
  const input = container.querySelector(`.input--menge[data-id="${id}"]`);
  if (!input) return;
  input.classList.toggle('is-invalid', Boolean(issue));
  const note = input.parentElement.querySelector('.field__error');
  note.textContent = issue ?? '';
  note.hidden = !issue;
}
