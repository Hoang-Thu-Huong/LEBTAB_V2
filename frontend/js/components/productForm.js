import { escapeHtml } from '../utils/dom.js';
import { PRODUCT_INFO_FIELDS } from '../utils/productFields.js';

/**
 * Stammdaten-Formular (13 Felder aus PRODUCT_INFO_FIELDS) fuer create.html; edit/infoForm.js (Phase 8) nutzt es mit
 * lmcReadonly = true. Reine Render-Funktion: Werte kommen aus dem state der Seite, jede Eingabe geht per onChange
 * zurueck. Wird EINMAL gezeichnet — Fehler werden mit applyFormErrors ohne Neuzeichnen gesetzt (Regel 4, 3.3).
 * LMC: Anzeige per CSS in Grossbuchstaben, onChange liefert den Wert bereits in Grossbuchstaben (Entscheidung
 * 06/10/2026: alle 20.315 Codes sind gross geschrieben).
 */

function inputHtml(field, value, itemarts, lmcReadonly) {
  const name = escapeHtml(field.key);
  const val = escapeHtml(value ?? '');
  if (field.input === 'itemart') {
    const values = !value || itemarts.includes(value) ? itemarts : [value, ...itemarts];
    const options = values
      .map((v) => `<option value="${escapeHtml(v)}" ${v === value ? 'selected' : ''}>${escapeHtml(v)}</option>`)
      .join('');
    return `<select class="input" name="${name}">${options}</select>`;
  }
  if (field.input === 'date') return `<input class="input" type="date" name="${name}" value="${val}">`;
  if (field.input === 'int') {
    return `<input class="input" type="text" inputmode="numeric" name="${name}" value="${val}" autocomplete="off">`;
  }
  if (field.input === 'lmc') {
    return `<input class="input code field__input--lmc" type="text" name="${name}" value="${val}" maxlength="6"
      autocomplete="off" spellcheck="false" ${lmcReadonly ? 'readonly' : ''}>`;
  }
  return `<input class="input" type="text" name="${name}" value="${val}" maxlength="${field.maxLength}">`;
}

/**
 * @param {HTMLElement} container
 * @param {{form: Record<string, string>, errors?: Record<string, string>, itemarts: string[], lmcReadonly?: boolean}} props
 * @param {{onChange: (key: string, value: string) => void, onLmcBlur?: (value: string) => void}} handlers
 *   onChange bei jeder Eingabe; onLmcBlur, wenn das LMC-Feld geaendert und verlassen wurde (Existenzpruefung)
 */
export function renderProductForm(container, { form, errors = {}, itemarts, lmcReadonly = false }, handlers) {
  const fields = PRODUCT_INFO_FIELDS.map(
    (field) => `<label class="field" data-field="${escapeHtml(field.key)}">
      <span class="field__label">${escapeHtml(field.label)}${field.required ? ' *' : ''}</span>
      ${inputHtml(field, form[field.key], itemarts, lmcReadonly)}
      <span class="field__error" hidden></span>
    </label>`,
  ).join('');
  container.innerHTML = `<div class="form-grid">${fields}</div>`;
  applyFormErrors(container, errors);

  const read = (ev) => {
    const el = ev.target.closest('[name]');
    return el ? { name: el.name, value: el.name === 'lebtab_lmc' ? el.value.toUpperCase() : el.value } : null;
  };
  // input meldet jede Eingabe; change (Feld verlassen) meldet NICHT erneut, sondern loest nur die LMC-Pruefung aus.
  container.oninput = (ev) => {
    const changed = read(ev);
    if (changed) handlers.onChange(changed.name, changed.value);
  };
  container.onchange = (ev) => {
    const changed = read(ev);
    if (changed?.name === 'lebtab_lmc' && handlers.onLmcBlur) handlers.onLmcBlur(changed.value);
  };
}

/**
 * Setzt/entfernt Fehlermeldungen unter den Feldern, ohne das Formular neu zu zeichnen (Fokus bleibt erhalten).
 * @param {HTMLElement} container
 * @param {Record<string, string>} errors key -> Meldung (Deutsch); fehlender key = kein Fehler
 */
export function applyFormErrors(container, errors) {
  for (const field of PRODUCT_INFO_FIELDS) {
    const wrap = container.querySelector(`[data-field="${field.key}"]`);
    if (!wrap) continue;
    const issue = errors[field.key] ?? '';
    wrap.querySelector('.input').classList.toggle('is-invalid', issue !== '');
    const note = wrap.querySelector('.field__error');
    note.textContent = issue;
    note.hidden = issue === '';
  }
}
