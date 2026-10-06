/** URL-Zustand der Produktliste: Filter + Seite (docs/ARCHITECTURE.md 7.2, DECISIONS #64). Reine Funktionen. */
export const FILTER_KEYS = ['search', 'itemart', 'datum_from', 'datum_to'];
const PAGE_PATTERN = /^\d{1,9}$/;

export function emptyFilters() {
  return { search: '', itemart: '', datum_from: '', datum_to: '' };
}

function activeFilters(filters) {
  const active = {};
  for (const key of FILTER_KEYS) {
    const value = String(filters[key] ?? '').trim();
    if (value !== '') active[key] = value;
  }
  return active;
}

/** @param {string} search location.search @returns {{filters: Record<string, string>, page: number}} */
export function readListState(search) {
  const params = new URLSearchParams(search);
  const filters = emptyFilters();
  for (const key of FILTER_KEYS) filters[key] = (params.get(key) ?? '').trim();
  const pageRaw = params.get('page') ?? '';
  const page = PAGE_PATTERN.test(pageRaw) && Number(pageRaw) >= 1 ? Number(pageRaw) : 1;
  return { filters, page };
}

/**
 * Fuehrt history.back() von der Detailseite zur Liste zurueck (Filter + Seite bleiben erhalten)?
 * Nur wenn die vorige Seite DIESES Tabs die Liste war: ein per Strg-/Mittelklick geoeffneter Tab hat die Liste
 * als Referrer, aber keine History — dort muss der normale Link nach index.html greifen.
 * @param {string} referrer document.referrer
 * @param {string} origin location.origin
 * @param {number} historyLength history.length
 * @returns {boolean}
 */
export function canGoBackToList(referrer, origin, historyLength) {
  if (historyLength <= 1) return false;
  try {
    const ref = new URL(referrer);
    return ref.origin === origin && /(\/|\/index\.html)$/.test(ref.pathname);
  } catch {
    return false;
  }
}

/** Parameter fuer api.getProducts — leere Filter fehlen (URLSearchParams macht aus undefined "undefined"). */
export function buildListParams(filters, page, pageSize) {
  return { ...activeFilters(filters), page, pageSize };
}

/** Query-String fuer history.replaceState: '' oder '?…'; page nur wenn > 1, nie pageSize. */
export function buildListQueryString(filters, page) {
  const params = activeFilters(filters);
  if (page > 1) params.page = page;
  const qs = new URLSearchParams(params).toString();
  return qs === '' ? '' : `?${qs}`;
}
