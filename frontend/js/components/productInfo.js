import { escapeHtml } from '../utils/dom.js';
import { DASH, formatDate, formatNumber } from '../utils/format.js';
import { PRODUCT_INFO_FIELDS } from '../utils/productFields.js';

function valueHtml(field, value) {
  if (value === null || value === undefined || value === '') return DASH;
  if (field.type === 'date') return escapeHtml(formatDate(value));
  if (field.type === 'number') return escapeHtml(formatNumber(value));
  if (field.type === 'itemart') return `<span class="tag">${escapeHtml(value)}</span>`;
  return escapeHtml(value);
}

/**
 * Stammdaten (7 Basis- + 6 Klassifikationsspalten) als Definitionsliste. Reine Render-Funktion.
 * @param {HTMLElement} container
 * @param {{product: Record<string, unknown>}} props
 */
export function renderProductInfo(container, { product }) {
  const items = PRODUCT_INFO_FIELDS.map(
    (field) => `<div class="info-grid__item">
      <dt class="info-grid__label">${escapeHtml(field.label)}</dt>
      <dd class="info-grid__value">${valueHtml(field, product[field.key])}</dd>
    </div>`,
  ).join('');
  container.innerHTML = `<dl class="info-grid">${items}</dl>`;
}
