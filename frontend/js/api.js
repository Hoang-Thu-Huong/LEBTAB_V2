/**
 * Einzige Stelle im Frontend, die fetch aufruft (docs/ARCHITECTURE.md 3.3 Regel 2, 7.1).
 * Fehler werden als { status, code, message, details, current } geworfen — Seiten lesen nie res.status.
 */
const BASE_URL = '/api';

async function request(method, path, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* HTML/leerer Body */
    }
    const e = payload?.error ?? {
      code: 'NETWORK_ERROR',
      message: 'Server nicht erreichbar',
      status: res.status,
    };
    throw {
      status: res.status,
      code: e.code,
      message: e.message,
      details: e.details ?? [],
      current: payload?.current ?? null,
    };
  }
  return res.status === 204 ? null : res.json();
}

const enc = encodeURIComponent;

export const api = {
  /** @param {Record<string, string|number>} params */
  getProducts: (params) => request('GET', '/products?' + new URLSearchParams(params)),
  getProduct: (lmc) => request('GET', `/products/${enc(lmc)}`),
  createProduct: (payload) => request('POST', '/products', payload),
  updateProduct: (lmc, payload) => request('PUT', `/products/${enc(lmc)}`, payload),
  deleteProduct: (lmc) => request('DELETE', `/products/${enc(lmc)}`),
  recalculate: (lmc, rowVersion) =>
    request('POST', `/products/${enc(lmc)}/recalculate`, { _row_version: rowVersion }),
  addIngredient: (lmc, payload) => request('POST', `/products/${enc(lmc)}/ingredients`, payload),
  updateIngredient: (lmc, id, payload) =>
    request('PUT', `/products/${enc(lmc)}/ingredients/${id}`, payload),
  deleteIngredient: (lmc, id) => request('DELETE', `/products/${enc(lmc)}/ingredients/${id}`),
  getPhotos: (lmc) => request('GET', `/products/${enc(lmc)}/photos`),
  uploadPhotos: (lmc, formData) => request('POST', `/products/${enc(lmc)}/photos`, formData),
  deletePhoto: (lmc, filename) =>
    request('DELETE', `/products/${enc(lmc)}/photos/${enc(filename)}`),
  getArchive: (type, page = 1) => request('GET', `/archive?type=${type}&page=${page}`),
  restore: (type, id) => request('POST', `/archive/restore/${type}/${id}`),
  // #2b — einzige Ausnahme ohne request(): HEAD hat keinen Body.
  productExists: async (lmc) =>
    (await fetch(`${BASE_URL}/products/${enc(lmc)}`, { method: 'HEAD' })).ok,
  // #13 — Cache pro Browser-Sitzung; Meta aendert sich nur beim Deploy (Itemart-Liste ist fest, DECISIONS #36).
  getMeta: async () => {
    try {
      const c = sessionStorage.getItem('meta');
      if (c) return JSON.parse(c);
    } catch {
      /* Storage gesperrt */
    }
    const meta = await request('GET', '/meta');
    try {
      sessionStorage.setItem('meta', JSON.stringify(meta));
    } catch {
      /* ignorieren */
    }
    return meta;
  },
};
