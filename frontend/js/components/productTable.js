import { escapeHtml } from '../utils/dom.js';
import { formatDate } from '../utils/format.js';

/**
 * Produktliste, 4 Spalten (docs/SPEC.md 6.1 #1). Reine Render-Funktion, kein API-Aufruf.
 * @param {HTMLElement} container
 * @param {{items: Array<{lebtab_lmc: string, lebtab_Bezeich: string, lebtab_Itemart: string, lebtab_Datum: string}>}} props
 * @param {{onSelect?: (lmc: string) => void}} handlers
 */
export function renderProductTable(container, { items }, { onSelect } = {}) {
  if (!items.length) {
    container.innerHTML = '<div class="table__empty">Keine Produkte gefunden.</div>';
    return;
  }
  const rows = items
    .map(
      (p) => `<tr class="table__row table__row--clickable" data-lmc="${escapeHtml(p.lebtab_lmc)}">
        <td class="code">${escapeHtml(p.lebtab_lmc)}</td>
        <td>${escapeHtml(p.lebtab_Bezeich)}</td>
        <td><span class="tag">${escapeHtml(p.lebtab_Itemart)}</span></td>
        <td>${escapeHtml(formatDate(p.lebtab_Datum))}</td>
      </tr>`,
    )
    .join('');
  container.innerHTML = `<table class="table">
    <thead><tr><th>LMC</th><th>Bezeichnung</th><th>Itemart</th><th>Datum</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  container.onclick = (ev) => {
    const row = ev.target.closest('tr[data-lmc]');
    if (row && onSelect) onSelect(row.dataset.lmc);
  };
}
