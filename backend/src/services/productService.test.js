import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/db.js', () => ({ pool: { tag: 'pool' } }));
vi.mock('../config/schemaInfo.js', () => ({ getSchemaInfo: vi.fn() }));
vi.mock('../models/lebtabModel.js', () => ({
  findPage: vi.fn(),
  count: vi.fn(),
  findByLmc: vi.fn(),
  exists: vi.fn(),
}));
vi.mock('../models/czutabModel.js', () => ({ findByLmcWithZutat: vi.fn() }));

import { getSchemaInfo } from '../config/schemaInfo.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { listProducts, getProduct, productExists } from './productService.js';

const POOL = { tag: 'pool' };
const NO_FILTERS = { search: null, itemarts: null, datumFrom: null, datumTo: null };

/** Flache DB-Zeile mit allen 92 Spalten; Naehrwerte = Index, damit Verwechslungen auffallen. */
function flatRow(extra = {}) {
  const row = {
    lebtab_lmc: 'A1CK00', lebtab_Bezeich: 'Joghurt', lebtab_Marke: null, lebtab_Version: 3,
    lebtab_Itemart: 'V', lebtab_Datum: '2016-07-26', lebtab_aktuell: 1,
    lebtab_lmgruppe: 12, lebtab_gruppename: 'Milch', lebtab_source: null, lebtab_source_code: null,
    lebtab_source_detail: null, lebtab_probiotisch: 0,
  };
  NUTRITION_COLUMNS.forEach((c, i) => { row[c] = i === 5 ? null : i + 0.5; });
  return { ...row, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSchemaInfo.mockResolvedValue({ technicalColumns: false, archive: false });
});

describe('productService.listProducts', () => {
  it('passes parsed filters + limit/offset to the model and returns the paging shape', async () => {
    lebtabModel.findPage.mockResolvedValue([{ lebtab_lmc: 'A00001' }]);
    lebtabModel.count.mockResolvedValue(42);
    const res = await listProducts({ search: ' Käse ', itemart: 'V,N', page: '3', pageSize: '20' });
    const filters = { search: 'Käse', itemarts: ['V', 'N'], datumFrom: null, datumTo: null };
    expect(lebtabModel.findPage).toHaveBeenCalledWith(filters, { limit: 20, offset: 40 }, POOL);
    expect(lebtabModel.count).toHaveBeenCalledWith(filters, POOL);
    expect(res).toEqual({ items: [{ lebtab_lmc: 'A00001' }], total: 42, page: 3, pageSize: 20 });
  });

  it('applies defaults page=1, pageSize=20, no filters', async () => {
    lebtabModel.findPage.mockResolvedValue([]);
    lebtabModel.count.mockResolvedValue(0);
    const res = await listProducts({});
    expect(lebtabModel.findPage).toHaveBeenCalledWith(NO_FILTERS, { limit: 20, offset: 0 }, POOL);
    expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('rejects invalid query with 400 before touching the model', async () => {
    await expect(listProducts({ pageSize: '201' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'pageSize', issue: expect.any(String) }],
    });
    await expect(listProducts({ itemart: 'X' })).rejects.toMatchObject({ status: 400 });
    expect(lebtabModel.findPage).not.toHaveBeenCalled();
    expect(lebtabModel.count).not.toHaveBeenCalled();
  });
});

describe('productService.getProduct', () => {
  it('shapes the flat row: 13 root columns, nutrition{79}, ingredients, technical defaults 1/0/null', async () => {
    const ingredients = [{ id: 1, LMC: 'A1CK00', LM_Zutat: 'L00001', Menge: 25, Version: 3, Anrcode: 0, zutat: null }];
    lebtabModel.findByLmc.mockResolvedValue(flatRow());
    czutabModel.findByLmcWithZutat.mockResolvedValue(ingredients);

    const p = await getProduct('A1CK00');

    expect(lebtabModel.findByLmc).toHaveBeenCalledWith('A1CK00', { technicalColumns: false }, POOL);
    expect(czutabModel.findByLmcWithZutat).toHaveBeenCalledWith('A1CK00', POOL);
    expect(Object.keys(p)).toEqual([
      'lebtab_lmc', 'lebtab_Bezeich', 'lebtab_Marke', 'lebtab_Version', 'lebtab_Itemart', 'lebtab_Datum',
      'lebtab_aktuell', 'lebtab_lmgruppe', 'lebtab_gruppename', 'lebtab_source', 'lebtab_source_code',
      'lebtab_source_detail', 'lebtab_probiotisch', 'nutrition', 'ingredients',
      '_row_version', 'lebtab_nutrition_stale', 'lebtab_bemerkung',
    ]);
    expect(Object.keys(p.nutrition)).toEqual([...NUTRITION_COLUMNS]);
    expect(p.nutrition.lebtab_E_CAL).toBe(0.5);
    expect(p.nutrition[NUTRITION_COLUMNS[5]]).toBeNull(); // null bleibt null, wird nicht 0
    expect(p.lebtab_E_CAL).toBeUndefined(); // Naehrwerte NICHT an der Wurzel
    expect(p.ingredients).toBe(ingredients);
    expect(p).toMatchObject({ _row_version: 1, lebtab_nutrition_stale: 0, lebtab_bemerkung: null });
  });

  it('returns the real technical values after migration 001', async () => {
    getSchemaInfo.mockResolvedValue({ technicalColumns: true, archive: true });
    lebtabModel.findByLmc.mockResolvedValue(
      flatRow({ _row_version: 7, lebtab_nutrition_stale: 1, lebtab_bemerkung: 'Hinweis' }),
    );
    czutabModel.findByLmcWithZutat.mockResolvedValue([]);
    const p = await getProduct('A1CK00');
    expect(lebtabModel.findByLmc).toHaveBeenCalledWith('A1CK00', { technicalColumns: true }, POOL);
    expect(p).toMatchObject({ _row_version: 7, lebtab_nutrition_stale: 1, lebtab_bemerkung: 'Hinweis' });
  });

  it('throws 404 PRODUCT_NOT_FOUND when the row does not exist', async () => {
    lebtabModel.findByLmc.mockResolvedValue(null);
    czutabModel.findByLmcWithZutat.mockResolvedValue([]);
    await expect(getProduct('ZZZZZZ')).rejects.toMatchObject({
      status: 404, code: 'PRODUCT_NOT_FOUND', message: 'Produkt nicht gefunden',
    });
  });

  it('throws 404 for a malformed lmc WITHOUT touching the DB (DECISIONS #55)', async () => {
    for (const bad of ['abc', 'A1CK000', '../etc', '']) {
      await expect(getProduct(bad)).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    }
    expect(getSchemaInfo).not.toHaveBeenCalled();
    expect(lebtabModel.findByLmc).not.toHaveBeenCalled();
    expect(czutabModel.findByLmcWithZutat).not.toHaveBeenCalled();
  });
});

describe('productService.productExists', () => {
  it('delegates to the model for a well-formed lmc', async () => {
    lebtabModel.exists.mockResolvedValue(true);
    expect(await productExists('A1CK00')).toBe(true);
    expect(lebtabModel.exists).toHaveBeenCalledWith('A1CK00', POOL);
  });
  it('is false for a malformed lmc without touching the DB', async () => {
    expect(await productExists('abc')).toBe(false);
    expect(lebtabModel.exists).not.toHaveBeenCalled();
  });
});
