import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { pool } from './db.js';
import { getSchemaInfo, resetSchemaInfoCache } from './schemaInfo.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetSchemaInfoCache();
});

describe('getSchemaInfo', () => {
  it('reports false/false before migrations', async () => {
    pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
    expect(await getSchemaInfo()).toEqual({ technicalColumns: false, archive: false });
  });

  it('reports true/true when all 3 columns and archive table exist, and caches', async () => {
    pool.query
      .mockResolvedValueOnce([
        [
          { COLUMN_NAME: '_row_version' },
          { COLUMN_NAME: 'lebtab_nutrition_stale' },
          { COLUMN_NAME: 'lebtab_bemerkung' },
        ],
      ])
      .mockResolvedValueOnce([[{ 'Tables_in_lebtab_new (lebtab_archive)': 'lebtab_archive' }]]);
    expect(await getSchemaInfo()).toEqual({ technicalColumns: true, archive: true });
    await getSchemaInfo();
    expect(pool.query).toHaveBeenCalledTimes(2); // gecacht
  });
});
