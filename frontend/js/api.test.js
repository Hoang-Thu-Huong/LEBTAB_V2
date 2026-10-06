import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

const NETWORK_ERROR = { status: 0, code: 'NETWORK_ERROR', message: 'Server nicht erreichbar', details: [], current: null };

describe('api.request', () => {
  it('maps a rejected fetch to a German NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.getProducts({ page: 1 })).rejects.toEqual(NETWORK_ERROR);
  });

  it('passes through the structured backend error', async () => {
    const body = { error: { code: 'VALIDATION_ERROR', message: 'Ungültige Anfrageparameter', status: 400, details: [{ field: 'itemart', issue: 'x' }] } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => body }));
    await expect(api.getProducts({ itemart: 'X' })).rejects.toEqual({
      status: 400, code: 'VALIDATION_ERROR', message: 'Ungültige Anfrageparameter',
      details: [{ field: 'itemart', issue: 'x' }], current: null,
    });
  });

  it('builds the query string from params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.getProducts({ search: '3,5%F', page: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/products?search=3%2C5%25F&page=2');
  });
});

describe('api.productExists (HEAD #2b)', () => {
  it('200 -> true, 404 -> false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    expect(await api.productExists('A1CK00')).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await api.productExists('ZZZZZZ')).toBe(false);
  });

  it('503 throws DB_UNAVAILABLE instead of answering "does not exist"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(api.productExists('A1CK00')).rejects.toMatchObject({
      status: 503, code: 'DB_UNAVAILABLE', message: 'Datenbank nicht erreichbar',
    });
  });

  it('rejected fetch throws NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.productExists('A1CK00')).rejects.toEqual(NETWORK_ERROR);
  });
});
