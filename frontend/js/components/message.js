import { escapeHtml } from '../utils/dom.js';

/** Text fuer Programm-/Darstellungsfehler, die keine API-Fehler sind (DECISIONS #71). */
const UNEXPECTED_ERROR_TEXT = 'Unerwarteter Fehler. Bitte die Seite neu laden.';

/** Gemeinsame Status-/Fehlermeldungen (docs/ARCHITECTURE.md 3.3). err.message kommt bereits auf Deutsch vom Backend. */
function show(container, kind, html) {
  container.className = `message message--${kind}`;
  container.innerHTML = html;
  container.hidden = false;
}

export function showLoading(container) {
  show(container, 'loading', 'Lade …');
}

/**
 * @param {{code?: string, message?: string, details?: Array<{field: string, issue: string}>} | Error} err
 *   API-Fehler aus api.js bzw. { message } einer Seite -> Text unveraendert (bereits Deutsch).
 *   Error-Instanz (JS-Ausnahme, z. B. aus render()) -> deutscher Standardtext + technische Meldung klein darunter.
 */
export function showError(container, err) {
  if (err instanceof Error) {
    const detail = escapeHtml(`${err.name}: ${err.message}`);
    show(
      container,
      'error',
      `<strong>${escapeHtml(UNEXPECTED_ERROR_TEXT)}</strong><div class="message__detail">${detail}</div>`,
    );
    return;
  }
  const details = (err?.details ?? [])
    .map((d) => `<li><span class="code">${escapeHtml(d.field)}</span>: ${escapeHtml(d.issue)}</li>`)
    .join('');
  const text = escapeHtml(err?.message ?? 'Unbekannter Fehler');
  show(container, 'error', `<strong>${text}</strong>${details ? `<ul>${details}</ul>` : ''}`);
}

export function showSuccess(container, text) {
  show(container, 'success', escapeHtml(text));
}

export function clearMessage(container) {
  container.hidden = true;
  container.innerHTML = '';
}
