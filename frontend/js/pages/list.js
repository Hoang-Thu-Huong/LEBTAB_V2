import { api } from '../api.js';
import { $ } from '../utils/dom.js';
import { renderProductTable } from '../components/productTable.js';
import { renderPagination } from '../components/pagination.js';
import { showError, showLoading, clearMessage } from '../components/message.js';

const DEFAULT_PAGE_SIZE = 20;

const state = { page: 1, pageSize: DEFAULT_PAGE_SIZE, data: null };

async function load() {
  showLoading($('#message'));
  try {
    state.data = await api.getProducts({ page: state.page, pageSize: state.pageSize });
    clearMessage($('#message'));
    render();
  } catch (err) {
    showError($('#message'), err);
  }
}

function render() {
  const { items, total, page, pageSize } = state.data;
  $('#result-count').textContent = `${total} Produkte`;
  renderProductTable($('#products'), { items }, { onSelect: openDetail });
  renderPagination($('#pagination'), { page, pageSize, total }, { onPage: goToPage });
}

function openDetail(lmc) {
  location.href = 'detail.html?lmc=' + encodeURIComponent(lmc);
}

function goToPage(page) {
  state.page = page;
  load();
}

load();
