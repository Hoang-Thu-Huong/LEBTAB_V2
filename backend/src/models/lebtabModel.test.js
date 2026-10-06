import { describe, it, expect, vi } from 'vitest';
import {
  escapeLike,
  findPage,
  count,
  findByLmc,
  exists,
  findNutritionByLmcs,
  findStoredLmc,
} from './lebtabModel.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';

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

describe('exists', () => {
  it('returns true/false from a 1-row probe', async () => {
    expect(await exists('A1CK00', fakeConn([{ found: 1 }]))).toBe(true);
    const conn = fakeConn([]);
    expect(await exists('ZZZZZZ', conn)).toBe(false);
    expect(sqlOf(conn)).toBe('SELECT 1 AS found FROM lebtab WHERE lebtab_lmc = ? LIMIT 1');
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
