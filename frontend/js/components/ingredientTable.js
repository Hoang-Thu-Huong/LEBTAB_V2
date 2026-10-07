import { escapeHtml } from '../utils/dom.js';
import { DASH, formatNumber } from '../utils/format.js';
import { isZusatz, itemartLabel, summarizeIngredients } from '../utils/ingredients.js';

/** Hinweis bei leerer Rezeptur im Formular (Entscheidung 06/10/2026: Anlegen ohne Zutaten bleibt erlaubt). */
const EMPTY_LOCAL_NOTE = 'Ohne Zutaten bleiben alle Nährwerte leer.';

function rowHtml(row) {
  const known = row.zutat !== null;
  const code = escapeHtml(row.LM_Zutat);
  const codeCell = known
    ? `<a class="link code" href="detail.html?lmc=${escapeHtml(encodeURIComponent(row.LM_Zutat))}">${code}</a>`
    : `<span class="code">${code}</span>`;
  const name = known ? escapeHtml(row.zutat.lebtab_Bezeich) : '<em class="muted">unbekannt</em>';
  const itemart = known
    ? `<span class="tag">${escapeHtml(itemartLabel(row.zutat.lebtab_Itemart))}</span>`
    : DASH;
  return `<tr class="${isZusatz(row) ? 'table__row--zusatz' : ''}">
    <td>${codeCell}</td><td>${name}</td><td>${itemart}</td>
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

/** Gueltige Menge einer lokalen Zeile: Zahl >= 0 (leer = noch nicht eingegeben, zaehlt als 0). */
function mengeValid(row) {
  return Number.isFinite(row.Menge) && row.Menge >= 0;
}

/** Nicht-leerer Text, der keine Zahl >= 0 ist ("abc", "-5", "1.000,5"): sofort rot, nicht erst beim Speichern. */
function mengeInvalid(row) {
  return String(row.mengeText ?? '').trim() !== '' && !mengeValid(row);
}

/**
 * Summe der lokalen Zeilen: leere ODER ungueltige Menge zaehlt als 0, Zeilen mit 0 bleiben sichtbar;
 * sumOk ist false, solange eine Zeile ungueltig ist (die Summe darf dann nicht schwarz "100 g" zeigen).
 */
function localSummary(rows) {
  const summary = summarizeIngredients(rows.map((row) => ({ ...row, Menge: mengeValid(row) ? row.Menge : 0 })));
  return { ...summary, sumOk: summary.sumOk && !rows.some(mengeInvalid) };
}

function localRowHtml(row, issue) {
  const id = escapeHtml(row.tmpId);
  const invalid = Boolean(issue) || mengeInvalid(row);
  return `<tr class="${isZusatz(row) ? 'table__row--zusatz' : ''}" data-tmp-id="${id}">
    <td><span class="code">${escapeHtml(row.LM_Zutat)}</span></td>
    <td>${escapeHtml(row.zutat.lebtab_Bezeich)}</td>
    <td><span class="tag">${escapeHtml(itemartLabel(row.zutat.lebtab_Itemart))}</span></td>
    <td class="num"><input class="input input--menge ${invalid ? 'is-invalid' : ''}" type="text" inputmode="decimal"
        data-tmp-id="${id}" value="${escapeHtml(row.mengeText)}" autocomplete="off">
      <span class="field__error" ${issue ? '' : 'hidden'}>${escapeHtml(issue ?? '')}</span></td>
    <td><button type="button" class="btn btn--small" data-action="remove" data-tmp-id="${id}">Entfernen</button></td>
  </tr>`;
}

function renderLocal(container, rows, errors, { onMengeInput, onRemove }) {
  if (rows.length === 0) {
    container.innerHTML = `<div class="table__empty">Noch keine Zutaten ausgewählt.</div>
      <p class="note muted">${escapeHtml(EMPTY_LOCAL_NOTE)}</p>`;
  } else {
    const { sum, sumOk } = localSummary(rows);
    container.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Code</th><th>Bezeichnung</th><th>Itemart</th><th class="num">Menge (g)</th><th></th></tr></thead>
      <tbody>${rows.map((row) => localRowHtml(row, errors[row.tmpId])).join('')}</tbody>
    </table></div>
    <p class="note">Summe der Zutaten (ohne Zusätze):
      <strong id="menge-sum" class="${sumOk ? '' : 'sum-warn'}">${escapeHtml(formatNumber(sum))} g</strong>
      <span class="sum-warn sum-warn-note" ${sumOk ? 'hidden' : ''}>≠ 100 g</span></p>`;
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
    onMengeInput(Number(input.dataset.tmpId), input.value);
  };
  container.onclick = (ev) => {
    const button = ev.target.closest('[data-action="remove"]');
    if (button) onRemove(Number(button.dataset.tmpId));
  };
}

/**
 * Zutatentabelle. mode 'readonly' (detail, Phase 2): blendet Menge = 0 aus (+ Hinweis), Summe ohne Zusaetze,
 * leere Rezeptur -> Hinweis ohne Summe (DECISIONS #63). mode 'local' (create, Phase 6): Menge als Eingabefeld,
 * Button "Entfernen", alle Zeilen sichtbar, Fehler je Zeile; Summe per updateIngredientSum ohne Neuzeichnen.
 * Reine Render-Funktion, kein API-Aufruf. mode 'remote' folgt in Phase 7.
 * @param {HTMLElement} container
 * @param {{rows: object[], mode?: 'readonly'|'local', errors?: Record<number, string>}} props
 *   local-Zeile: { tmpId, LM_Zutat, mengeText, Menge: number|null, zutat: {lebtab_Bezeich, lebtab_Itemart} }
 * @param {{onMengeInput?: (tmpId: number, text: string) => void, onRemove?: (tmpId: number) => void}} [handlers]
 */
export function renderIngredientTable(container, { rows, mode = 'readonly', errors = {} }, handlers = {}) {
  if (mode === 'local') renderLocal(container, rows, errors, handlers);
  else renderReadonly(container, rows);
}

/**
 * Nur Summenzeile + Rahmen der Menge-Felder aktualisieren (waehrend der Benutzer eine Menge tippt — Regel 4,
 * docs/ARCHITECTURE.md 3.3): ein Feld mit ungueltigem Text wird sofort rot, ohne die Tabelle neu zu zeichnen.
 * @param {HTMLElement} container
 * @param {object[]} rows lokale Zeilen aus dem state
 */
export function updateIngredientSum(container, rows) {
  const sumEl = container.querySelector('#menge-sum');
  if (!sumEl) return;
  for (const input of container.querySelectorAll('.input--menge')) {
    const row = rows.find((r) => String(r.tmpId) === input.dataset.tmpId);
    if (row) input.classList.toggle('is-invalid', mengeInvalid(row));
  }
  const { sum, sumOk } = localSummary(rows);
  sumEl.textContent = `${formatNumber(sum)} g`;
  sumEl.classList.toggle('sum-warn', !sumOk);
  container.querySelector('.sum-warn-note').hidden = sumOk;
}
