import { describe, it, expect } from 'vitest';
import { LEBTAB_EXPORT_COLUMNS } from './exportColumns.js';
import { BASIC_COLUMNS, CLASSIFICATION_COLUMNS, TECHNICAL_COLUMNS } from './productColumns.js';
import { NUTRITION_COLUMNS } from './nutritionColumns.js';

describe('LEBTAB_EXPORT_COLUMNS', () => {
  it('has exactly 92 unique columns and is frozen', () => {
    expect(LEBTAB_EXPORT_COLUMNS).toHaveLength(92);
    expect(new Set(LEBTAB_EXPORT_COLUMNS).size).toBe(92);
    expect(Object.isFrozen(LEBTAB_EXPORT_COLUMNS)).toBe(true);
  });

  it('never contains the 3 technical columns of migration 001', () => {
    for (const column of TECHNICAL_COLUMNS) expect(LEBTAB_EXPORT_COLUMNS).not.toContain(column);
    expect(LEBTAB_EXPORT_COLUMNS).not.toContain('_row_version');
    expect(LEBTAB_EXPORT_COLUMNS).not.toContain('lebtab_nutrition_stale');
    expect(LEBTAB_EXPORT_COLUMNS).not.toContain('lebtab_bemerkung');
  });

  it('follows the table order: 7 basic, 79 nutrition, 6 classification columns', () => {
    expect(LEBTAB_EXPORT_COLUMNS.slice(0, 7)).toEqual([...BASIC_COLUMNS]);
    expect(LEBTAB_EXPORT_COLUMNS.slice(7, 86)).toEqual([...NUTRITION_COLUMNS]);
    expect(LEBTAB_EXPORT_COLUMNS.slice(86)).toEqual([...CLASSIFICATION_COLUMNS]);
    expect(LEBTAB_EXPORT_COLUMNS[0]).toBe('lebtab_lmc');
    expect(LEBTAB_EXPORT_COLUMNS[7]).toBe('lebtab_E_CAL');
    expect(LEBTAB_EXPORT_COLUMNS[91]).toBe('lebtab_probiotisch');
  });

  it('uses the real column name lebtab_gruppename and the documented spelling', () => {
    expect(LEBTAB_EXPORT_COLUMNS).toContain('lebtab_gruppename');
    expect(LEBTAB_EXPORT_COLUMNS).not.toContain('lebtab_name_lmgruppe');
    expect(LEBTAB_EXPORT_COLUMNS).toContain('lebtab_Bezeich');
    expect(LEBTAB_EXPORT_COLUMNS).not.toContain('lebtab_bezeich');
  });
});
