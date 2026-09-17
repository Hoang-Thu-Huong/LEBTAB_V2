/** DOM-Helfer (docs/ARCHITECTURE.md 3.3 Regel 5, 8.2). */

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Pflicht fuer jeden Datenwert, der in innerHTML landet.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/** @returns {Element|null} */
export function $(selector, root = document) {
  return root.querySelector(selector);
}

/** @returns {Element[]} */
export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Liest ?lmc= aus der URL; null wenn fehlt. */
export function getLmcFromUrl() {
  return new URLSearchParams(window.location.search).get('lmc');
}

/**
 * Sperrt einen Button waehrend eines API-Aufrufs (Doppel-Submit vermeiden).
 * @param {HTMLButtonElement} button
 * @param {boolean} busy
 */
export function setBusy(button, busy) {
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
}
