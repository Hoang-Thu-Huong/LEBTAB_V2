import { describe, it, expect, vi } from 'vitest';
import {
  escapeLike,
  findPage,
  count,
  findByLmc,
  findNutritionByLmcs,
  findStoredLmc,
  findStoredLmcs,
  insert,
  streamExportRows,
} from './lebtabModel.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { LEBTAB_EXPORT_COLUMNS } from '../utils/exportColumns.js';
import { TECHNICAL_COLUMNS } from '../utils/productColumns.js';

const fakeConn = (rows) => ({ query: vi.fn().mockResolvedValue([rows]) });
const NO_FILTERS = { search: null, itemarts: null, datumFrom: null, datumTo: null };
const sqlOf = (conn) => conn.query.mock.calls[0][0].replace(/\s+/g, ' ');
const paramsOf = (conn) => conn.query.mock.calls[0][1];

describe('escapeLike', () => {
  it("escapes ! % _ with '!' and leaves everything else (incl. backslash) alone", () => {
    expect(escapeLike('3,5%F_a!b\\c')).toBe('3,5!%F!_a!!b\\c');
  });
});

describe('findPage / count', () => {
  it('has no WHERE without filters and selects exactly the 4 list columns', async () => {
    const conn = fakeConn([]);
    await findPage(NO_FILTERS, { limit: 20, offset: 40 }, conn);
    expect(sqlOf(conn)).toBe(
      'SELECT lebtab_lmc, lebtab_Bezeich, lebtab_Itemart, lebtab_Datum FROM lebtab ORDER BY lebtab_lmc LIMIT ? OFFSET ?',
    );
    expect(paramsOf(conn)).toEqual([20, 40]);
  });

  it('builds all 4 filter clauses with placeholders only', async () => {
    const conn = fakeConn([]);
    const filters = { search: '3,5%F', itemarts: ['V', 'N'], datumFrom: '2020-01-01', datumTo: '2020-12-31' };
    await findPage(filters, { limit: 5, offset: 0 }, conn);
    expect(sqlOf(conn)).toContain(
      "WHERE (lebtab_Bezeich LIKE ? ESCAPE '!' OR lebtab_lmc LIKE ? ESCAPE '!') AND lebtab_Itemart IN (?) AND lebtab_Datum >= ? AND lebtab_Datum <= ?",
    );
    expect(paramsOf(conn)).toEqual(['%3,5!%F%', '%3,5!%F%', ['V', 'N'], '2020-01-01', '2020-12-31', 5, 0]);
    expect(sqlOf(conn)).not.toContain('3,5');
  });

  it('count uses the same WHERE and returns a number', async () => {
    const conn = fakeConn([{ total: '17' }]);
    const total = await count({ ...NO_FILTERS, itemarts: ['V'] }, conn);
    expect(total).toBe(17);
    expect(sqlOf(conn)).toBe('SELECT COUNT(*) AS total FROM lebtab WHERE lebtab_Itemart IN (?)');
    expect(paramsOf(conn)).toEqual([['V']]);
  });
});

describe('findByLmc', () => {
  it('selects 92 explicit columns without technical columns, never SELECT *', async () => {
    const conn = fakeConn([{ lebtab_lmc: 'A1CK00' }]);
    const row = await findByLmc('A1CK00', { technicalColumns: false }, conn);
    expect(row).toEqual({ lebtab_lmc: 'A1CK00' });
    const sql = sqlOf(conn);
    expect(sql).not.toContain('*');
    expect(sql).not.toContain('_row_version');
    expect(sql).toContain('lebtab_Bezeich');
    expect(sql).toContain('lebtab_gruppename');
    for (const c of NUTRITION_COLUMNS) expect(sql).toContain(c);
    expect(sql.endsWith('FROM lebtab WHERE lebtab_lmc = ? LIMIT 1')).toBe(true);
    expect(paramsOf(conn)).toEqual(['A1CK00']);
  });

  it('adds the 3 technical columns when migration 001 has run', async () => {
    const conn = fakeConn([]);
    const row = await findByLmc('ZZZZZZ', { technicalColumns: true }, conn);
    expect(row).toBeNull();
    expect(sqlOf(conn)).toContain('_row_version, lebtab_nutrition_stale, lebtab_bemerkung FROM lebtab');
  });
});

describe('findNutritionByLmcs', () => {
  it('reads code, Itemart and the 79 nutrition columns with one IN (?) query, never SELECT *', async () => {
    const conn = fakeConn([{ lebtab_lmc: 'AFB000' }, { lebtab_lmc: 'JVB100' }]);
    const rows = await findNutritionByLmcs(['AFB000', 'JVB100'], conn);
    expect(rows).toEqual([{ lebtab_lmc: 'AFB000' }, { lebtab_lmc: 'JVB100' }]);
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(sqlOf(conn)).toBe(
      `SELECT lebtab_lmc, lebtab_Itemart, ${NUTRITION_COLUMNS.join(', ')} FROM lebtab WHERE lebtab_lmc IN (?)`,
    );
    expect(sqlOf(conn)).not.toContain('*');
    expect(paramsOf(conn)).toEqual([['AFB000', 'JVB100']]);
  });

  it('selects exactly 81 columns: no basic, classification or technical column besides lmc and Itemart', async () => {
    const conn = fakeConn([]);
    await findNutritionByLmcs(['AFB000'], conn);
    const selected = sqlOf(conn).slice('SELECT '.length, sqlOf(conn).indexOf(' FROM ')).split(', ');
    expect(selected).toEqual(['lebtab_lmc', 'lebtab_Itemart', ...NUTRITION_COLUMNS]);
  });

  it('sends no query for an empty list', async () => {
    const conn = fakeConn([]);
    expect(await findNutritionByLmcs([], conn)).toEqual([]);
    expect(conn.query).not.toHaveBeenCalled();
  });
});

describe('findStoredLmc', () => {
  it('returns the product number exactly as stored, read with a single-column query', async () => {
    const conn = fakeConn([{ lebtab_lmc: 'A1CK00' }]);
    expect(await findStoredLmc('a1ck00', conn)).toBe('A1CK00');
    expect(sqlOf(conn)).toBe('SELECT lebtab_lmc FROM lebtab WHERE lebtab_lmc = ? LIMIT 1');
    expect(paramsOf(conn)).toEqual(['a1ck00']);
  });

  it('returns null when the product does not exist', async () => {
    expect(await findStoredLmc('ZZZZZZ', fakeConn([]))).toBeNull();
  });
});

describe('streamExportRows', () => {
  it('streams exactly the 92 export columns ordered by lebtab_lmc — never * and never a technical column', () => {
    const rowStream = { marker: 'row stream' };
    const rawConn = { query: vi.fn(() => ({ stream: () => rowStream })) };
    expect(streamExportRows(rawConn)).toBe(rowStream);
    const sql = rawConn.query.mock.calls[0][0];
    expect(sql).toBe(`SELECT ${LEBTAB_EXPORT_COLUMNS.join(', ')} FROM lebtab ORDER BY lebtab_lmc`);
    expect(sql).not.toContain('*');
    for (const column of TECHNICAL_COLUMNS) expect(sql).not.toContain(column);
  });

  it('passes neither parameters nor a callback, so mysql2 does not buffer the result', () => {
    const rawConn = { query: vi.fn(() => ({ stream: () => ({}) })) };
    streamExportRows(rawConn);
    expect(rawConn.query.mock.calls[0]).toHaveLength(1);
  });
});

describe('findStoredLmcs (Phase 6)', () => {
  it('uses ONE IN (?) query and returns the stored codes', async () => {
    const conn = fakeConn([{ lebtab_lmc: 'A1A100' }, { lebtab_lmc: 'JVB100' }]);
    expect(await findStoredLmcs(['a1a100', 'JVB100', 'X00000'], conn)).toEqual(['A1A100', 'JVB100']);
    expect(sqlOf(conn)).toBe('SELECT lebtab_lmc FROM lebtab WHERE lebtab_lmc IN (?)');
    expect(paramsOf(conn)).toEqual([['a1a100', 'JVB100', 'X00000']]);
  });
  it('empty list -> [] without a query', async () => {
    const conn = fakeConn([]);
    expect(await findStoredLmcs([], conn)).toEqual([]);
    expect(conn.query).not.toHaveBeenCalled();
  });
});

describe('insert (Phase 6)', () => {
  const row = () => {
    const r = {
      lebtab_lmc: 'ZZT001', lebtab_Bezeich: 'Test', lebtab_Marke: null, lebtab_Version: null, lebtab_Itemart: 'V',
      lebtab_Datum: '2026-10-06', lebtab_aktuell: 1, lebtab_lmgruppe: null, lebtab_gruppename: null,
      lebtab_source: null, lebtab_source_code: null, lebtab_source_detail: null, lebtab_probiotisch: null,
    };
    NUTRITION_COLUMNS.forEach((c, i) => { r[c] = i === 3 ? null : i; });
    return r;
  };

  it('inserts exactly the 92 original columns in table order with placeholders only — never the 3 technical columns', async () => {
    const conn = fakeConn({ affectedRows: 1 });
    await insert({ ...row(), _row_version: 9, lebtab_bemerkung: 'x' }, conn);
    const sql = sqlOf(conn);
    const columns = /INSERT INTO lebtab \((.*)\) VALUES \(\?\)$/.exec(sql)[1].split(', ');
    expect(columns).toHaveLength(92);
    expect(columns.slice(0, 7)).toEqual(['lebtab_lmc', 'lebtab_Bezeich', 'lebtab_Marke', 'lebtab_Version', 'lebtab_Itemart', 'lebtab_Datum', 'lebtab_aktuell']);
    expect(columns.slice(13)).toEqual([...NUTRITION_COLUMNS]);
    expect(columns.slice(7, 13)).toEqual(['lebtab_lmgruppe', 'lebtab_gruppename', 'lebtab_source', 'lebtab_source_code', 'lebtab_source_detail', 'lebtab_probiotisch']);
    expect(columns).not.toContain('_row_version');
    expect(columns).not.toContain('lebtab_bemerkung');
    expect(sql).not.toContain('ZZT001');
    const values = paramsOf(conn)[0];
    expect(values).toHaveLength(92);
    expect(values.slice(0, 2)).toEqual(['ZZT001', 'Test']);
    expect(values[7]).toBeNull(); // lebtab_lmgruppe
    expect(values[13]).toBe(0); // lebtab_E_CAL
    expect(values[16]).toBeNull(); // null bleibt null, wird nicht 0
  });

  it('throws before querying when a column is missing (undefined would silently become NULL)', async () => {
    const conn = fakeConn({ affectedRows: 1 });
    const r = row();
    delete r.lebtab_V_B1;
    await expect(insert(r, conn)).rejects.toThrow(/lebtab_V_B1/);
    expect(conn.query).not.toHaveBeenCalled();
  });
});
