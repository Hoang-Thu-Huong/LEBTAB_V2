import { setBusy } from '../../utils/dom.js';
import { productToForm, isInfoFormDirty } from '../../utils/productForm.js';
import { validateProductForm } from '../../utils/validators.js';
import { renderProductForm, applyFormErrors } from '../../components/productForm.js';
import { showError, showSuccess, clearMessage } from '../../components/message.js';

// Zweig A von edit.html (docs/ARCHITECTURE.md 7.5, Phase 8): Stammdaten-Formular (productForm mit lmcReadonly),
// Pruefung der Pflichtfelder vor dem Senden, "Stammdaten speichern" -> onSubmit(form). Ruft nie api.* auf:
// edit.js baut den PUT-Body (12 Spalten + _row_version) und behandelt 409 mit conflictDialog.
const INVALID_TEXT = 'Bitte die markierten Felder korrigieren.';

const state = { form: {}, errors: {}, product: null, itemarts: [], saving: false };
let handlers = {};
/** Einmal nach dem Zeichnen erfasst (data-role, nicht Klasse — message.js ersetzt className). */
const el = { fields: null, save: null, message: null };

/**
 * @param {HTMLElement} container
 * @param {{product: Record<string, unknown>, itemarts: string[]}} props product = Datensatz wie #2
 * @param {{onSubmit: (form: Record<string, string>) => Promise<Record<string, unknown> | null>}} h
 *   liefert das gespeicherte Produkt, oder null, wenn die Seite neu geladen wurde (Konflikt -> "Neu laden")
 */
export function renderInfoForm(container, { product, itemarts }, h) {
  handlers = h;
  Object.assign(state, { form: productToForm(product), errors: {}, product, itemarts, saving: false });
  container.innerHTML = `<div data-role="fields"></div>
    <div class="form-actions info-form__actions">
      <button type="button" class="btn btn--primary" data-role="save">Stammdaten speichern</button>
    </div>
    <div class="message" data-role="message" hidden></div>`;
  el.fields = container.querySelector('[data-role="fields"]');
  el.save = container.querySelector('[data-role="save"]');
  el.message = container.querySelector('[data-role="message"]');
  renderProductForm(el.fields, { form: state.form, itemarts, lmcReadonly: true }, { onChange });
  el.save.onclick = submit;
}

/** Ungespeicherte Aenderungen? (beforeunload in edit.js, Entscheidung 08/10/2026) */
export function isInfoFormChanged() {
  return state.product !== null && isInfoFormDirty(state.form, state.product);
}

function onChange(key, value) {
  state.form[key] = value;
  if (state.errors[key]) {
    delete state.errors[key];
    applyFormErrors(el.fields, state.errors);
  }
}

/** details[] eines 400 VALIDATION_ERROR -> Fehler am Feld (Feldname = Spaltenname, docs/SPEC.md 6.2). */
function errorsFromDetails(details) {
  const errors = {};
  for (const { field, issue } of details ?? []) if (field in state.form) errors[field] = issue;
  return errors;
}

async function submit() {
  if (state.saving) return;
  state.errors = validateProductForm(state.form, state.itemarts);
  applyFormErrors(el.fields, state.errors);
  if (Object.keys(state.errors).length > 0) {
    showError(el.message, { message: INVALID_TEXT });
    return;
  }
  clearMessage(el.message);
  state.saving = true;
  setBusy(el.save, true);
  try {
    const saved = await handlers.onSubmit({ ...state.form });
    if (saved) {
      state.product = saved;
      state.form = productToForm(saved);
      showSuccess(el.message, 'Stammdaten gespeichert');
    }
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      state.errors = errorsFromDetails(err.details);
      applyFormErrors(el.fields, state.errors);
    }
    showError(el.message, err);
  } finally {
    state.saving = false;
    setBusy(el.save, false);
  }
}
