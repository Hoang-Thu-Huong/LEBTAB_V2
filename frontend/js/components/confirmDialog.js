import { escapeHtml } from '../utils/dom.js';

/**
 * @typedef {string | {text: string, warn?: boolean}} DialogLine Text; warn = rote Zeile (docs/SPEC.md 5.9)
 * @typedef {{head: string[], rows: string[][]}} DialogTable Tabelle in einem scrollbaren Bereich (Phase 8)
 */

function lineHtml(line) {
  const { text, warn = false } = typeof line === 'string' ? { text: line } : line;
  return `<p class="dialog__line${warn ? ' dialog__line--warn' : ''}">${escapeHtml(text)}</p>`;
}

function tableHtml({ head, rows }) {
  const cell = (tag, value, index) => `<${tag}${index > 0 ? ' class="num"' : ''}>${escapeHtml(value)}</${tag}>`;
  const headRow = `<tr>${head.map((value, i) => cell('th', value, i)).join('')}</tr>`;
  const body = rows.map((row) => `<tr>${row.map((value, i) => cell('td', value, i)).join('')}</tr>`).join('');
  return `<div class="dialog__scroll"><table class="table table--compact dialog__table">
      <thead>${headRow}</thead><tbody>${body}</tbody></table></div>`;
}

/**
 * Inhalt zwischen Titel und Buttons — rein, testbar. Jeder Text geht durch escapeHtml (Regel 5, 3.3).
 * @param {{lines?: DialogLine[], table?: DialogTable|null, notes?: DialogLine[]}} content
 *   lines vor der Tabelle, notes danach
 * @returns {string}
 */
export function dialogBodyHtml({ lines = [], table = null, notes = [] }) {
  return [...lines.map(lineHtml), table ? tableHtml(table) : '', ...notes.map(lineHtml)].join('');
}

/**
 * Bestaetigungsdialog fuer jede Aktion, die loescht oder ueberschreibt (docs/SPEC.md 5.9, Invariante 2).
 * Natives <dialog> + showModal(); "Abbrechen" hat den Fokus, damit ein versehentliches Enter nie bestaetigt.
 * Esc und "Abbrechen" liefern false. Nie der Standarddialog des Browsers.
 * @param {{title: string, lines?: DialogLine[], table?: DialogTable|null, notes?: DialogLine[],
 *   confirmLabel?: string, danger?: boolean}} options
 *   lines/notes: Textzeilen (werden escaped, warn = rot); table: z. B. "bisher -> neu" beim Neuberechnen (Phase 8);
 *   danger: roter Bestaetigen-Button (Loeschen)
 * @returns {Promise<boolean>} true nur nach Klick auf den Bestaetigen-Button
 */
export function confirmDialog({ title, lines = [], table = null, notes = [], confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.innerHTML = `<form method="dialog" class="dialog__form">
        <h3 class="dialog__title">${escapeHtml(title)}</h3>
        ${dialogBodyHtml({ lines, table, notes })}
        <div class="dialog__actions">
          <button class="btn" value="cancel" autofocus>Abbrechen</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" value="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </form>`;
    // <form method="dialog">: der Wert des geklickten Buttons landet in dialog.returnValue; Esc laesst ihn leer.
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'confirm');
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
