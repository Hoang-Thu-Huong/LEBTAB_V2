import { escapeHtml } from '../utils/dom.js';

/**
 * Filterleiste der Produktliste (docs/ARCHITECTURE.md 7.2). Reine Render-Funktion, kein API-Aufruf.
 * Itemart = EIN Wert (DECISIONS #56); Datum = <input type="date"> (Wert immer YYYY-MM-DD).
 * @param {HTMLElement} container
 * @param {{filters: {search: string, itemart: string, datum_from: string, datum_to: string}, itemarts: string[]}} props
 * @param {{onSearch: (filters: object) => void, onReset: () => void}} handlers
 */
export function renderFilterBar(container, { filters, itemarts }, { onSearch, onReset }) {
  // Ein per URL gesetzter Wert bleibt waehlbar, auch wenn Meta (noch) nicht geladen ist.
  const values = !filters.itemart || itemarts.includes(filters.itemart) ? itemarts : [filters.itemart, ...itemarts];
  const options = values
    .map((v) => `<option value="${escapeHtml(v)}" ${v === filters.itemart ? 'selected' : ''}>${escapeHtml(v)}</option>`)
    .join('');
  container.innerHTML = `<form class="filters" novalidate>
    <label class="filters__field filters__field--grow">Suche (Bezeichnung oder LMC)
      <input class="input" type="search" name="search" maxlength="255" value="${escapeHtml(filters.search)}">
    </label>
    <label class="filters__field">Itemart
      <select class="input" name="itemart"><option value="">Alle</option>${options}</select>
    </label>
    <label class="filters__field">Datum von
      <input class="input" type="date" name="datum_from" value="${escapeHtml(filters.datum_from)}">
    </label>
    <label class="filters__field">Datum bis
      <input class="input" type="date" name="datum_to" value="${escapeHtml(filters.datum_to)}">
    </label>
    <div class="filters__actions">
      <button class="btn btn--primary" type="submit">Suchen</button>
      <button class="btn" type="button" data-action="reset">Zurücksetzen</button>
    </div>
  </form>`;

  container.onsubmit = (ev) => {
    ev.preventDefault();
    const el = ev.target.elements;
    onSearch({
      search: el.search.value,
      itemart: el.itemart.value,
      datum_from: el.datum_from.value,
      datum_to: el.datum_to.value,
    });
  };
  container.onclick = (ev) => {
    if (ev.target.closest('[data-action="reset"]')) onReset();
  };
}
