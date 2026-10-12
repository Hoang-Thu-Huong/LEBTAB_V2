import { escapeHtml, setBusy } from '../utils/dom.js';

/**
 * Bemerkung auf detail.html (docs/SPEC.md 5.10, docs/ARCHITECTURE.md 7.3): Textfeld + "Bemerkung speichern".
 * Reine Render-Funktion; die Seite ruft api.updateProduct im Handler onSave(text). Wird nur von render() der Seite
 * gezeichnet — nie waehrend getippt wird (Regel 4, 3.3). Teile werden per data-role gefunden, nicht per Klasse
 * (message.js show() ersetzt className).
 */
const READONLY_HINT = 'Bemerkungen können erst nach Datenbank-Migration 001 gespeichert werden.';

/** Zeichen zaehlen wie das Backend (Codepunkte). */
export function bemerkungCountText(text, maxLength) {
  return `${[...text].length} / ${maxLength} Zeichen`;
}

/**
 * @param {{text: string, readonly?: boolean, maxLength: number}} props
 * @returns {string}
 */
export function bemerkungHtml({ text, readonly = false, maxLength }) {
  const area = `<textarea class="input bemerkung__text" data-role="text" rows="5" ${readonly ? 'readonly' : ''}
      aria-label="Bemerkung">${escapeHtml(text)}</textarea>`;
  if (readonly) return `${area}<p class="note muted">${escapeHtml(READONLY_HINT)}</p>`;
  return `${area}
    <div class="bemerkung__actions">
      <span class="muted" data-role="count">${escapeHtml(bemerkungCountText(text, maxLength))}</span>
      <button type="button" class="btn btn--primary" data-role="save">Bemerkung speichern</button>
    </div>
    <div class="message" data-role="message" hidden></div>`;
}

/**
 * @param {HTMLElement} container
 * @param {{text: string, readonly?: boolean, maxLength: number}} props
 * @param {{onSave: (text: string) => void}} handlers
 */
export function renderBemerkungBox(container, props, handlers) {
  container.innerHTML = bemerkungHtml(props);
  container.oninput = (ev) => {
    const count = container.querySelector('[data-role="count"]');
    if (count && ev.target.closest('[data-role="text"]')) {
      count.textContent = bemerkungCountText(ev.target.value, props.maxLength);
    }
  };
  container.onclick = (ev) => {
    if (ev.target.closest('[data-role="save"]')) {
      handlers.onSave(container.querySelector('[data-role="text"]').value);
    }
  };
}

/** Button sperren, waehrend gespeichert wird. */
export function setBemerkungBusy(container, busy) {
  const button = container.querySelector('[data-role="save"]');
  if (button) setBusy(button, busy);
}

/** Meldungsbereich unter dem Button (fuer showSuccess/showError der Seite). */
export function bemerkungMessage(container) {
  return container.querySelector('[data-role="message"]');
}

/** Getippten Text nach "Neu laden" wieder einsetzen (Konflikt, Entscheidung 08/10/2026) — inkl. Zaehler. */
export function setBemerkungText(container, text, maxLength) {
  container.querySelector('[data-role="text"]').value = text;
  const count = container.querySelector('[data-role="count"]');
  if (count) count.textContent = bemerkungCountText(text, maxLength);
}
