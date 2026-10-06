import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/schemaInfo.js', () => ({
  getSchemaInfo: vi.fn().mockResolvedValue({ technicalColumns: true, archive: false }),
}));

import { ITEMARTS } from '../utils/itemarts.js';
import { NUTRITION_FIELDS, NUTRITION_GROUPS } from '../utils/nutritionFields.js';
import { getMeta } from './metaService.js';

describe('metaService.getMeta', () => {
  it('returns constants, features from schemaInfo and the 3 limits (SPEC #13)', async () => {
    const meta = await getMeta();
    expect(Object.keys(meta)).toEqual(['nutritionGroups', 'nutritionFields', 'itemarts', 'features', 'limits']);
    expect(meta.nutritionGroups).toEqual(NUTRITION_GROUPS);
    expect(meta.nutritionFields).toEqual(NUTRITION_FIELDS);
    expect(meta.itemarts).toEqual(ITEMARTS);
    expect(meta.features).toEqual({ technicalColumns: true, archive: false });
    expect(meta.limits).toEqual({ photoMaxPerProduct: 10, photoMaxSize: 10485760, bemerkungMaxLength: 10000 });
  });
});
