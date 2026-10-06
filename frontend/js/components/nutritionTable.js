import { escapeHtml } from '../utils/dom.js';
import { formatNumber, salzFromNatrium } from '../utils/format.js';

const NATRIUM_KEY = 'lebtab_NATR';
const SALZ_LABEL = 'Salz (berechnet)';

function fieldRows(field, nutrition) {
  const unit = field.unit ? ` ${escapeHtml(field.unit)}` : '';
  let html = `<tr><th scope="row" class="code">${escapeHtml(field.label)}</th>
    <td class="num">${escapeHtml(formatNumber(nutrition[field.key]))}${unit}</td></tr>`;
  if (field.key === NATRIUM_KEY) {
    // Nur Anzeige (docs/ARCHITECTURE.md 7.7): NATR mg * 2.5 / 1000 = Salz g. Unveraendert ausgegeben (DECISIONS #58).
    const salz = formatNumber(salzFromNatrium(nutrition[field.key]));
    html += `<tr class="row--computed"><th scope="row">${SALZ_LABEL}</th><td class="num">${escapeHtml(salz)}</td></tr>`;
  }
  return html;
}

/**
 * 79 Naehrwerte in 6 Gruppen. Labels kommen NUR aus meta.nutritionFields (#13) — nichts hart kodiert.
 * @param {HTMLElement} container
 * @param {{nutrition: Record<string, number|null>, meta: {nutritionGroups: Array<{id: string, label: string}>,
 *          nutritionFields: Array<{key: string, label: string, group: string, unit: string|null}>}}} props
 */
export function renderNutritionTable(container, { nutrition, meta }) {
  const groups = meta.nutritionGroups
    .map((group) => {
      const rows = meta.nutritionFields
        .filter((field) => field.group === group.id)
        .map((field) => fieldRows(field, nutrition))
        .join('');
      return `<section class="nutri-group">
        <h4 class="nutri-group__title">${escapeHtml(group.label)}</h4>
        <table class="table table--compact"><tbody>${rows}</tbody></table>
      </section>`;
    })
    .join('');
  container.innerHTML = `<div class="nutri-grid">${groups}</div>`;
}
