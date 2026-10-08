import { describe, it, expect, vi } from 'vitest';
import {
  findByLmcWithZutat,
  findByIdWithZutat,
  findByIdForUpdate,
  findByLmcAndZutat,
  countByLmc,
  findColumnNames,
  streamExportRows,
  insert,
  insertMany,
  updateMenge,
  deleteById,
} from './czutabModel.js';

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

describe('czutabModel.insertMany (Phase 6)', () => {
  it('inserts all rows with ONE multi-row INSERT (VALUES ?) in list order and returns affectedRows', async () => {
    const conn = { query: vi.fn().mockResolvedValue([{ affectedRows: 2 }]) };
    const rows = [
      { LMC: 'ZZT001', LM_Zutat: 'A1A100', Menge: 60, Version: 0, Anrcode: 0 },
      { LMC: 'ZZT001', LM_Zutat: 'JVB100', Menge: 0.5, Version: 0, Anrcode: 0 },
    ];
    expect(await insertMany(rows, conn)).toBe(2);
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query.mock.calls[0][0].replace(/\s+/g, ' ')).toBe(
      'INSERT INTO c_zutab (LMC, LM_Zutat, Menge, Version, Anrcode) VALUES ?',
    );
    expect(conn.query.mock.calls[0][1]).toEqual([[['ZZT001', 'A1A100', 60, 0, 0], ['ZZT001', 'JVB100', 0.5, 0, 0]]]);
  });

  it('empty list -> 0 without a query', async () => {
    const conn = { query: vi.fn() };
    expect(await insertMany([], conn)).toBe(0);
    expect(conn.query).not.toHaveBeenCalled();
  });
});

describe('czutabModel — Phase 7 (#7, #8, #9)', () => {
  const joined = { id: 7, LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25, Version: 0, Anrcode: 0, zutat_lmc: 'AFB000', zutat_Bezeich: 'Joghurt', zutat_Itemart: 'L' };

  it('findByIdWithZutat: same JOIN as findByLmcWithZutat, WHERE z.id = ? LIMIT 1, null when missing', async () => {
    const conn = { query: vi.fn().mockResolvedValue([[joined]]) };
    expect(await findByIdWithZutat(7, conn)).toEqual({
      id: 7, LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25, Version: 0, Anrcode: 0, zutat: { lebtab_Bezeich: 'Joghurt', lebtab_Itemart: 'L' },
    });
    const sql = conn.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sql).toContain('LEFT JOIN lebtab l ON l.lebtab_lmc = z.LM_Zutat');
    expect(sql).toContain('WHERE z.id = ? LIMIT 1');
    expect(conn.query.mock.calls[0][1]).toEqual([7]);
    expect(await findByIdWithZutat(8, { query: vi.fn().mockResolvedValue([[]]) })).toBeNull();
  });

  it('findByIdForUpdate: locks the row (FOR UPDATE), 6 explicit columns, null when missing', async () => {
    const row = { id: 7, LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25, Version: 3, Anrcode: 0 };
    const conn = { query: vi.fn().mockResolvedValue([[row]]) };
    expect(await findByIdForUpdate(7, conn)).toEqual(row);
    expect(conn.query.mock.calls[0][0]).toBe('SELECT id, LMC, LM_Zutat, Menge, Version, Anrcode FROM c_zutab WHERE id = ? FOR UPDATE');
    expect(conn.query.mock.calls[0][1]).toEqual([7]);
    expect(await findByIdForUpdate(9, { query: vi.fn().mockResolvedValue([[]]) })).toBeNull();
  });

  it('findByLmcAndZutat: id + Menge of every existing row of the pair, ordered by id (soft duplicate warning)', async () => {
    const conn = { query: vi.fn().mockResolvedValue([[{ id: 1, Menge: 25 }, { id: 9, Menge: 30 }]]) };
    expect(await findByLmcAndZutat('A1CK00', 'AFB000', conn)).toEqual([{ id: 1, Menge: 25 }, { id: 9, Menge: 30 }]);
    expect(conn.query.mock.calls[0][0]).toBe('SELECT id, Menge FROM c_zutab WHERE LMC = ? AND LM_Zutat = ? ORDER BY id');
    expect(conn.query.mock.calls[0][1]).toEqual(['A1CK00', 'AFB000']);
  });

  it('countByLmc returns a number', async () => {
    const conn = { query: vi.fn().mockResolvedValue([[{ total: '172' }]]) };
    expect(await countByLmc('SABB00', conn)).toBe(172);
    expect(conn.query.mock.calls[0]).toEqual(['SELECT COUNT(*) AS total FROM c_zutab WHERE LMC = ?', ['SABB00']]);
  });

  it('insert: one row with placeholders, returns insertId', async () => {
    const conn = { query: vi.fn().mockResolvedValue([{ insertId: 540974, affectedRows: 1 }]) };
    expect(await insert({ LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 12.5, Version: 0, Anrcode: 0 }, conn)).toBe(540974);
    expect(conn.query.mock.calls[0]).toEqual([
      'INSERT INTO c_zutab (LMC, LM_Zutat, Menge, Version, Anrcode) VALUES (?, ?, ?, ?, ?)',
      ['A1CK00', 'AFB000', 12.5, 0, 0],
    ]);
  });

  it('updateMenge changes only Menge by id; deleteById deletes by id — both return affectedRows', async () => {
    const conn = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    expect(await updateMenge(7, 40, conn)).toBe(1);
    expect(conn.query.mock.calls[0]).toEqual(['UPDATE c_zutab SET Menge = ? WHERE id = ?', [40, 7]]);
    expect(await deleteById(7, conn)).toBe(1);
    expect(conn.query.mock.calls[1]).toEqual(['DELETE FROM c_zutab WHERE id = ?', [7]]);
  });
});
