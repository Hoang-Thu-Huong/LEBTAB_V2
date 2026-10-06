import { escapeHtml } from '../utils/dom.js';

/**
 * Bestaetigungsdialog fuer jede Aktion, die loescht oder ueberschreibt (docs/SPEC.md 5.9, Invariante 2).
 * Natives <dialog> + showModal(); "Abbrechen" hat den Fokus, damit ein versehentliches Enter nie bestaetigt.
 * Esc und "Abbrechen" liefern false. Nie der Standarddialog des Browsers.
 * @param {{title: string, lines?: string[], confirmLabel?: string, danger?: boolean}} options
 *   lines: Textzeilen des Dialogs (werden escaped); danger: roter Bestaetigen-Button (Loeschen)
 * @returns {Promise<boolean>} true nur nach Klick auf den Bestaetigen-Button
 */
export function confirmDialog({ title, lines = [], confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    const text = lines.map((line) => `<p class="dialog__line">${escapeHtml(line)}</p>`).join('');
    dialog.innerHTML = `<form method="dialog" class="dialog__form">
        <h3 class="dialog__title">${escapeHtml(title)}</h3>
        ${text}
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
