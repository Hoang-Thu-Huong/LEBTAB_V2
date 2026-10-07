import { describe, it, expect, vi } from 'vitest';
import { findByLmcWithZutat, findColumnNames, streamExportRows } from './czutabModel.js';

describe('czutabModel.findByLmcWithZutat', () => {
  it('maps joined rows to IngredientRow; unmatched LM_Zutat -> zutat: null (SPEC 6.1.1)', async () => {
    const conn = {
      query: vi.fn().mockResolvedValue([
        [
          { id: 1, LMC: 'A1A100', LM_Zutat: 'L00001', Menge: 25, Version: 3, Anrcode: 0, zutat_lmc: 'L00001', zutat_Bezeich: 'Butter', zutat_Itemart: 'L' },
          { id: 2, LMC: 'A1A100', LM_Zutat: 'X99999', Menge: 0.5, Version: 2, Anrcode: 0, zutat_lmc: null, zutat_Bezeich: null, zutat_Itemart: null },
        ],
      ]),
    };
    const rows = await findByLmcWithZutat('A1A100', conn);
    expect(rows).toEqual([
      { id: 1, LMC: 'A1A100', LM_Zutat: 'L00001', Menge: 25, Version: 3, Anrcode: 0, zutat: { lebtab_Bezeich: 'Butter', lebtab_Itemart: 'L' } },
      { id: 2, LMC: 'A1A100', LM_Zutat: 'X99999', Menge: 0.5, Version: 2, Anrcode: 0, zutat: null },
    ]);
    const sql = conn.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sql).toContain('LEFT JOIN lebtab l ON l.lebtab_lmc = z.LM_Zutat');
    expect(sql).toContain('WHERE z.LMC = ? ORDER BY z.id');
    expect(sql).not.toContain('*');
    expect(conn.query.mock.calls[0][1]).toEqual(['A1A100']);
  });
});

describe('czutabModel.findColumnNames', () => {
  it('reads the column names of c_zutab in table order from INFORMATION_SCHEMA', async () => {
    const conn = {
      query: vi.fn().mockResolvedValue([[{ name: 'id' }, { name: 'LMC' }, { name: 'LM_Zutat' }, { name: 'Menge' }]]),
    };
    expect(await findColumnNames(conn)).toEqual(['id', 'LMC', 'LM_Zutat', 'Menge']);
    expect(conn.query.mock.calls[0]).toHaveLength(1);
    const sql = conn.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sql).toContain('FROM INFORMATION_SCHEMA.COLUMNS');
    expect(sql).toContain("WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'c_zutab'");
    expect(sql).toContain('ORDER BY ORDINAL_POSITION');
  });
});

describe('czutabModel.streamExportRows', () => {
  it('streams the whole table as it is (SELECT *), grouped by product (ORDER BY LMC, id), without buffering', () => {
    const rowStream = { marker: 'row stream' };
    const rawConn = { query: vi.fn(() => ({ stream: () => rowStream })) };
    expect(streamExportRows(rawConn)).toBe(rowStream);
    expect(rawConn.query.mock.calls[0]).toEqual(['SELECT * FROM c_zutab ORDER BY LMC, id']);
  });
});
