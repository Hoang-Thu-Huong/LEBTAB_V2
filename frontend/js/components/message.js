import { escapeHtml } from '../utils/dom.js';

/** Gemeinsame Status-/Fehlermeldungen (docs/ARCHITECTURE.md 3.3). err.message kommt bereits auf Deutsch vom Backend. */
function show(container, kind, html) {
  container.className = `message message--${kind}`;
  container.innerHTML = html;
  container.hidden = false;
}

export function showLoading(container) {
  show(container, 'loading', 'Lade …');
}

/** @param {{code?: string, message?: string, details?: Array<{field: string, issue: string}>}} err */
export function showError(container, err) {
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
