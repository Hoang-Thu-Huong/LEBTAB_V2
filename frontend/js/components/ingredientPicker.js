import { escapeHtml } from '../utils/dom.js';
import { itemartLabel } from '../utils/ingredients.js';

/** Ab so vielen Zeichen wird gesucht — die Seite (create.js) importiert denselben Wert fuer die Suche. */
export const MIN_TERM_LENGTH = 2;

/**
 * Zutaten-Suchfeld fuer create.html (docs/ARCHITECTURE.md 7.4; Phase 7 auch edit). Reine Render-Funktion:
 * die Seite ruft api.getProducts auf und gibt das Ergebnis an renderPickerResults. Die Trefferliste wird getrennt
 * gezeichnet, damit das Suchfeld beim Tippen nie neu gezeichnet wird (Regel 4, 3.3). Keine Itemart-Filterung —
 * jedes Produkt darf Zutat sein (docs/SPEC.md 5.4); A erscheint als "Zusatz".
 * @param {HTMLElement} container
 * @param {object} _props
 * @param {{onSearch: (term: string) => void, onPick: (item: {lebtab_lmc: string, lebtab_Bezeich: string, lebtab_Itemart: string}) => void}} handlers
 */
export function renderIngredientPicker(container, _props, { onSearch, onPick }) {
  container.innerHTML = `<label class="field">
      <span class="field__label">Zutat suchen (Bezeichnung oder LMC)</span>
      <input class="input picker__input" type="search" maxlength="255" autocomplete="off"
        placeholder="mindestens ${MIN_TERM_LENGTH} Zeichen">
    </label>
    <div class="picker__message field__error" hidden></div>
    <div class="picker__results"></div>`;
  container.oninput = (ev) => {
    if (ev.target.closest('.picker__input')) onSearch(ev.target.value);
  };
  container.onclick = (ev) => {
    const item = ev.target.closest('.picker__item');
    if (!item) return;
    onPick({ lebtab_lmc: item.dataset.lmc, lebtab_Bezeich: item.dataset.bezeich, lebtab_Itemart: item.dataset.itemart });
  };
}

function itemHtml(item) {
  const tag = itemartLabel(item.lebtab_Itemart);
  return `<li><button type="button" class="picker__item" data-lmc="${escapeHtml(item.lebtab_lmc)}"
      data-bezeich="${escapeHtml(item.lebtab_Bezeich)}" data-itemart="${escapeHtml(item.lebtab_Itemart)}">
      <span class="code">${escapeHtml(item.lebtab_lmc)}</span>
      <span class="picker__name">${escapeHtml(item.lebtab_Bezeich)}</span>
      <span class="tag">${escapeHtml(tag)}</span>
    </button></li>`;
}

/**
 * Zeichnet nur die Trefferliste.
 * @param {HTMLElement} container derselbe Container wie bei renderIngredientPicker
 * @param {{status: 'idle'|'hint'|'loading'|'done'|'error', items?: object[], total?: number, error?: {message?: string}}} result
 *   done: items = Treffer (max. pageSize), total = Gesamtzahl laut API (total > items.length -> Hinweis)
 */
export function renderPickerResults(container, { status, items = [], total = 0, error = null }) {
  const box = container.querySelector('.picker__results');
  if (status === 'idle') box.innerHTML = '';
  else if (status === 'hint') box.innerHTML = `<p class="note muted">Mindestens ${MIN_TERM_LENGTH} Zeichen eingeben</p>`;
  else if (status === 'loading') box.innerHTML = '<p class="note muted">Suche …</p>';
  else if (status === 'error') {
    box.innerHTML = `<p class="note sum-warn">${escapeHtml(error?.message ?? 'Suche fehlgeschlagen')}</p>`;
  } else if (items.length === 0) box.innerHTML = '<p class="note muted">Keine Treffer</p>';
  else {
    const more = total > items.length ? '<p class="note muted">Weitere Treffer – Suche verfeinern</p>' : '';
    box.innerHTML = `<ul class="picker__list">${items.map(itemHtml).join('')}</ul>${more}`;
  }
}

/**
 * Rote Zeile unter dem Suchfeld (z. B. "… ist bereits in der Zutatenliste"); null blendet sie aus.
 * @param {HTMLElement} container
 * @param {string|null} text
 */
export function showPickerMessage(container, text) {
  const el = container.querySelector('.picker__message');
  el.textContent = text ?? '';
  el.hidden = !text;
}

/** Suchfeld leeren und Trefferliste schliessen (nach dem Uebernehmen einer Zutat). */
export function clearPicker(container) {
  container.querySelector('.picker__input').value = '';
  renderPickerResults(container, { status: 'idle' });
}
