import { escapeHtml } from '../utils/dom.js';

const TITLE = 'Nährwerte nicht aktuell';
const TEXT = 'Die Rezeptur wurde geändert; die gespeicherten 79 Nährwerte sind noch die alten.';
const BUTTON_LABEL = 'Neu berechnen & speichern';

/**
 * Banner "Nährwerte nicht aktuell" (docs/SPEC.md 5.2, docs/ARCHITECTURE.md 7.3/7.5). Reine Render-Funktion.
 * detail.html zeigt nur die Warnung; auf edit.html kommt in Phase 8 der Button "Neu berechnen & speichern"
 * (canRecalculate) dazu — Phase 7 zeigt ihn nie, weil Endpunkt #6 noch nicht existiert.
 * @param {HTMLElement} container
 * @param {{stale: number, canRecalculate?: boolean, busy?: boolean}} props stale = lebtab_nutrition_stale (0/1)
 * @param {{onRecalculate?: () => void}} [handlers]
 */
export function renderStaleBanner(container, { stale, canRecalculate = false, busy = false }, handlers = {}) {
  if (stale !== 1) {
    container.hidden = true;
    container.innerHTML = '';
    container.onclick = null;
    return;
  }
  const button = canRecalculate
    ? `<button type="button" class="btn btn--primary banner__action" data-action="recalculate" ${busy ? 'disabled' : ''}>${escapeHtml(BUTTON_LABEL)}</button>`
    : '';
  container.innerHTML = `<div class="banner banner--warn" role="status">
      <div class="banner__text"><strong>${escapeHtml(TITLE)}</strong> <span>${escapeHtml(TEXT)}</span></div>
      ${button}
    </div>`;
  container.hidden = false;
  container.onclick = (ev) => {
    if (ev.target.closest('[data-action="recalculate"]') && handlers.onRecalculate) handlers.onRecalculate();
  };
}
