import { escapeHtml } from '../utils/dom.js';

/**
 * Zurueck/Weiter + "Seite x von y (n Produkte)".
 * @param {HTMLElement} container
 * @param {{page: number, pageSize: number, total: number}} props
 * @param {{onPage: (page: number) => void}} handlers
 */
export function renderPagination(container, { page, pageSize, total }, { onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  container.innerHTML = `
    <button class="btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹ Zurück</button>
    <span class="pagination__info">Seite ${escapeHtml(page)} von ${escapeHtml(pages)} (${escapeHtml(total)} Produkte)</span>
    <button class="btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Weiter ›</button>`;

  container.onclick = (ev) => {
    const btn = ev.target.closest('button[data-page]');
    if (btn && !btn.disabled) onPage(Number(btn.dataset.page));
  };
}
