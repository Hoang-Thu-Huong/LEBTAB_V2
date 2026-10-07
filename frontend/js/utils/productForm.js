/**
 * Reine Formular-Logik fuer "Neu anlegen" (docs/ARCHITECTURE.md 7.4) — ohne DOM, mit Unit-Tests.
 * Der Formularzustand haelt ALLE Werte als Strings (so wie sie in den Eingabefeldern stehen);
 * erst buildCreatePayload wandelt sie in die Typen des API-Vertrags um (docs/SPEC.md 6.1 #3, 6.4).
 */
import { PRODUCT_INFO_FIELDS } from './productFields.js';

const DEFAULT_ITEMART = 'V';
const DEFAULT_AKTUELL = '1';

/**
 * Leeres Formular mit den Vorgaben: Itemart V, Datum heute (lokal), aktuell 1; Version bleibt leer.
 * @param {string} today 'YYYY-MM-DD' (format.todayLocal())
 * @returns {Record<string, string>}
 */
export function emptyProductForm(today) {
  const form = {};
  for (const field of PRODUCT_INFO_FIELDS) form[field.key] = '';
  form.lebtab_Itemart = DEFAULT_ITEMART;
  form.lebtab_Datum = today;
  form.lebtab_aktuell = DEFAULT_AKTUELL;
  return form;
}

function toPayloadValue(field, raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  return field.input === 'int' ? Number(text) : text;
}

/**
 * Body fuer POST /api/products: Strings getrimmt, leer -> null, Ganzzahlen als number,
 * ingredients nur { LM_Zutat, Menge } in Tabellenreihenfolge (Index = Zeile, wichtig fuer details[].field).
 * @param {Record<string, string>} form
 * @param {Array<{LM_Zutat: string, Menge: number|null}>} ingredients
 * @returns {Record<string, unknown>}
 */
export function buildCreatePayload(form, ingredients) {
  const payload = {};
  for (const field of PRODUCT_INFO_FIELDS) payload[field.key] = toPayloadValue(field, form[field.key]);
  payload.ingredients = ingredients.map((row) => ({ LM_Zutat: row.LM_Zutat, Menge: row.Menge }));
  return payload;
}

/**
 * Hat der Benutzer schon etwas eingegeben? (Rueckfrage des Browsers beim Verlassen der Seite.)
 * @param {Record<string, string>} form
 * @param {unknown[]} ingredients
 * @param {string} today Datum, mit dem das Formular angelegt wurde
 * @returns {boolean}
 */
export function isFormDirty(form, ingredients, today) {
  if (ingredients.length > 0) return true;
  const initial = emptyProductForm(today);
  return PRODUCT_INFO_FIELDS.some((field) => String(form[field.key] ?? '').trim() !== initial[field.key]);
}
