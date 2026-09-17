import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../models/lebtabModel.js', () => ({
  findPage: vi.fn(),
  countAll: vi.fn(),
}));
vi.mock('../config/db.js', () => ({ pool: { tag: 'pool' } }));

import * as lebtabModel from '../models/lebtabModel.js';
import { listProducts } from './productService.js';

beforeEach(() => vi.clearAllMocks());

describe('productService.listProducts', () => {
  it('maps page/pageSize to limit/offset and returns the paging shape', async () => {
    lebtabModel.findPage.mockResolvedValue([{ lebtab_lmc: 'A00001' }]);
    lebtabModel.countAll.mockResolvedValue(20315);
    const res = await listProducts({ page: 3, pageSize: 20 });
    expect(lebtabModel.findPage).toHaveBeenCalledWith({ limit: 20, offset: 40 }, { tag: 'pool' });
    expect(lebtabModel.countAll).toHaveBeenCalledWith({ tag: 'pool' });
    expect(res).toEqual({ items: [{ lebtab_lmc: 'A00001' }], total: 20315, page: 3, pageSize: 20 });
  });

  it('rejects invalid page/pageSize with VALIDATION_ERROR 400', async () => {
    await expect(listProducts({ page: 0, pageSize: 20 })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    await expect(listProducts({ page: 1, pageSize: 201 })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'pageSize', issue: expect.any(String) }],
    });
    expect(lebtabModel.findPage).not.toHaveBeenCalled();
  });

  it('applies defaults page=1, pageSize=20', async () => {
    lebtabModel.findPage.mockResolvedValue([]);
    lebtabModel.countAll.mockResolvedValue(0);
    const res = await listProducts({});
    expect(lebtabModel.findPage).toHaveBeenCalledWith({ limit: 20, offset: 0 }, { tag: 'pool' });
    expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});
