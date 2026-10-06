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

describe('api photos (#14, #15, #16)', () => {
  const okJson = (body) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

  it('getPhotos reads the photo list of one product', async () => {
    const fetchMock = okJson([]);
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.getPhotos('A1CK00')).toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/products/A1CK00/photos');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('uploadPhotos posts the FormData untouched and leaves the multipart Content-Type to the browser', async () => {
    const fetchMock = okJson([{ filename: '1-a.png' }]);
    vi.stubGlobal('fetch', fetchMock);
    const formData = new FormData();
    formData.append('photos', new Blob(['x'], { type: 'image/png' }), 'a.png');
    expect(await api.uploadPhotos('A1CK00', formData)).toEqual([{ filename: '1-a.png' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/products/A1CK00/photos');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(formData);
    expect(init.headers).toEqual({ Accept: 'application/json' }); // kein Content-Type: der Browser setzt die boundary
  });

  it('deletePhoto encodes product number and file name in the path', async () => {
    const fetchMock = okJson({ deleted: true, filename: '1-a b.png' });
    vi.stubGlobal('fetch', fetchMock);
    await api.deletePhoto('A1CK00', '1-a b.png');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/products/A1CK00/photos/1-a%20b.png');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('passes PHOTO_LIMIT_EXCEEDED with its details through to the page', async () => {
    const body = {
      error: {
        code: 'PHOTO_LIMIT_EXCEEDED',
        message: 'Maximal 10 Fotos pro Produkt',
        status: 400,
        details: [{ field: 'photos', issue: 'Maximal 10 Fotos pro Produkt (aktuell 8, frei 2)' }],
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => body }));
    await expect(api.uploadPhotos('A1CK00', new FormData())).rejects.toEqual({
      status: 400,
      code: 'PHOTO_LIMIT_EXCEEDED',
      message: 'Maximal 10 Fotos pro Produkt',
      details: [{ field: 'photos', issue: 'Maximal 10 Fotos pro Produkt (aktuell 8, frei 2)' }],
      current: null,
    });
  });
});
