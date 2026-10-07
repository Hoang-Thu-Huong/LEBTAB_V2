import { escapeHtml } from '../utils/dom.js';
import { DASH, formatNumber } from '../utils/format.js';
import { isZusatz, summarizeIngredients } from '../utils/ingredients.js';

const ZUSATZ_LABEL = 'Zusatz';

function rowHtml(row) {
  const known = row.zutat !== null;
  const code = escapeHtml(row.LM_Zutat);
  const codeCell = known
    ? `<a class="link code" href="detail.html?lmc=${escapeHtml(encodeURIComponent(row.LM_Zutat))}">${code}</a>`
    : `<span class="code">${code}</span>`;
  const name = known ? escapeHtml(row.zutat.lebtab_Bezeich) : '<em class="muted">unbekannt</em>';
  const itemart = known
    ? `<span class="tag">${escapeHtml(isZusatz(row) ? ZUSATZ_LABEL : row.zutat.lebtab_Itemart)}</span>`
    : DASH;
  return `<tr class="${isZusatz(row) ? 'table__row--zusatz' : ''}">
    <td>${codeCell}</td><td>${name}</td><td>${itemart}</td>
    <td class="num">${escapeHtml(formatNumber(row.Menge))}</td>
    <td class="num">${escapeHtml(formatNumber(row.Anrcode))}</td>
  </tr>`;
}

/**
 * Zutatentabelle. Phase 2: nur mode 'readonly' (docs/ARCHITECTURE.md 7.3); 'local'/'remote' folgen in Phase 6/7.
 * readonly blendet Zeilen mit Menge = 0 aus (+ Hinweis); Summe ohne Zusaetze, rot wenn != 100 g;
 * leere Rezeptur -> Hinweis ohne Summe (DECISIONS #63). Reine Render-Funktion, kein API-Aufruf.
 * @param {HTMLElement} container
 * @param {{rows: object[], mode: 'readonly'}} props
 * @param {object} [_handlers] erst ab Phase 6
 */
export function renderIngredientTable(container, { rows }, _handlers = {}) {
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
