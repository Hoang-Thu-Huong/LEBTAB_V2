/**
 * Reine Formular-Logik fuer "Neu anlegen" (docs/ARCHITECTURE.md 7.4) und das Stammdaten-Formular von edit.html
 * (Phase 8, 7.5 Zweig A) — ohne DOM, mit Unit-Tests.
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

/**
 * Formularzustand (Strings) aus einem Produkt von #2/#4: null -> '', Zahlen -> String (Phase 8, edit.html).
 * @param {Record<string, unknown>} product
 * @returns {Record<string, string>}
 */
export function productToForm(product) {
  const form = {};
  for (const field of PRODUCT_INFO_FIELDS) {
    const value = product[field.key];
    form[field.key] = value === null || value === undefined ? '' : String(value);
  }
  return form;
}

/**
 * Body fuer PUT /api/products/:lmc aus dem Stammdaten-Formular (docs/ARCHITECTURE.md 7.5 Zweig A): die 12 Spalten
 * OHNE lebtab_lmc (nur lesbar) und OHNE lebtab_bemerkung (wird auf detail.html gepflegt, docs/SPEC.md 5.10).
 * Leeres Feld -> null ausdruecklich, weil PUT PATCH-Semantik hat (fehlender Schluessel = unveraendert).
 * @param {Record<string, string>} form
 * @param {number} rowVersion _row_version des geladenen Produkts
 * @returns {Record<string, unknown>}
 */
export function buildUpdatePayload(form, rowVersion) {
  const payload = {};
  for (const field of PRODUCT_INFO_FIELDS) {
    if (field.input !== 'lmc') payload[field.key] = toPayloadValue(field, form[field.key]);
  }
  payload._row_version = rowVersion;
  return payload;
}

/**
 * Weicht das Stammdaten-Formular vom gespeicherten Produkt ab? (Rueckfrage beim Verlassen von edit.html.)
 * Vergleich nach trim — nur Leerzeichen am Rand gelten nicht als Aenderung.
 * @param {Record<string, string>} form
 * @param {Record<string, unknown>} product
 * @returns {boolean}
 */
export function isInfoFormDirty(form, product) {
  const saved = productToForm(product);
  return PRODUCT_INFO_FIELDS.some((field) => String(form[field.key] ?? '').trim() !== saved[field.key].trim());
}
