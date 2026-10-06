import { api } from '../api.js';
import { $ } from '../utils/dom.js';
import { emptyFilters, readListState, buildListParams, buildListQueryString } from '../utils/listParams.js';
import { renderFilterBar } from '../components/filterBar.js';
import { renderProductTable } from '../components/productTable.js';
import { renderPagination } from '../components/pagination.js';
import { showError, showLoading, clearMessage } from '../components/message.js';

const DEFAULT_PAGE_SIZE = 20;

const initial = readListState(location.search);
const state = {
  filters: initial.filters,
  page: initial.page,
  pageSize: DEFAULT_PAGE_SIZE,
  data: null,
  itemarts: [],
  requestSeq: 0,
};

async function init() {
  try {
    const meta = await api.getMeta();
    state.itemarts = meta.itemarts;
    $('#btn-create').hidden = !meta.features.technicalColumns; // 7.9: ohne Migration 001 kein Anlegen
  } catch {
    /* Liste funktioniert auch ohne Meta (Filter zeigt nur "Alle"); ein Serverfehler erscheint bei load(). */
  }
  renderFilters();
  load();
}

function renderFilters() {
  renderFilterBar(
    $('#filters'),
    { filters: state.filters, itemarts: state.itemarts },
    { onSearch: applyFilters, onReset: resetFilters },
  );
}

const STALE_SELECTORS = ['#result-count', '#products', '#pagination'];

/** Zaehler, Tabelle und Paging als veraltet kennzeichnen, solange die letzte Anfrage fehlgeschlagen ist (DECISIONS #70). */
function setStale(stale) {
  for (const selector of STALE_SELECTORS) $(selector).classList.toggle('is-stale', stale);
}

async function load() {
  const seq = ++state.requestSeq; // nur die JUENGSTE Antwort darf rendern (DECISIONS #66)
  history.replaceState(null, '', buildListQueryString(state.filters, state.page) || location.pathname);
  showLoading($('#message'));
  try {
    const data = await api.getProducts(buildListParams(state.filters, state.page, state.pageSize));
    if (seq !== state.requestSeq) return;
    const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (data.items.length === 0 && state.page > lastPage) {
      state.page = lastPage; // z. B. ?page=9999 aus einer alten URL
      load();
      return;
    }
    state.data = data;
    clearMessage($('#message'));
    setStale(false);
    render();
  } catch (err) {
    if (seq !== state.requestSeq) return;
    showError($('#message'), err);
    setStale(true); // Daten des letzten erfolgreichen Abrufs bleiben lesbar, aber sichtbar veraltet
  }
}

function render() {
  const { items, total, page, pageSize } = state.data;
  $('#result-count').textContent = `${total} Produkte`;
  renderProductTable($('#products'), { items }, { onSelect: openDetail });
  renderPagination($('#pagination'), { page, pageSize, total }, { onPage: goToPage });
}

function applyFilters(filters) {
  state.filters = filters;
  state.page = 1;
  load();
}

function resetFilters() {
  state.filters = emptyFilters();
  state.page = 1;
  renderFilters();
  load();
}

function openDetail(lmc) {
  location.href = 'detail.html?lmc=' + encodeURIComponent(lmc);
}

function goToPage(page) {
  state.page = page;
  load();
}

init();
