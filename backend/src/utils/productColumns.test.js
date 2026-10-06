import { describe, it, expect } from 'vitest';
import {
  BASIC_COLUMNS,
  CLASSIFICATION_COLUMNS,
  TECHNICAL_COLUMNS,
  TECHNICAL_DEFAULTS,
} from './productColumns.js';

describe('productColumns', () => {
  it('has 7 basic, 6 classification, 3 technical columns without overlap', () => {
    expect(BASIC_COLUMNS).toHaveLength(7);
    expect(CLASSIFICATION_COLUMNS).toHaveLength(6);
    expect(TECHNICAL_COLUMNS).toHaveLength(3);
    const all = [...BASIC_COLUMNS, ...CLASSIFICATION_COLUMNS, ...TECHNICAL_COLUMNS];
    expect(new Set(all).size).toBe(16);
  });

  it('uses the documented spelling (DATA.md 4.0/4.1)', () => {
    expect(BASIC_COLUMNS).toEqual([
      'lebtab_lmc', 'lebtab_Bezeich', 'lebtab_Marke', 'lebtab_Version',
      'lebtab_Itemart', 'lebtab_Datum', 'lebtab_aktuell',
    ]);
    expect(CLASSIFICATION_COLUMNS).toContain('lebtab_gruppename');
    expect(CLASSIFICATION_COLUMNS).not.toContain('lebtab_name_lmgruppe');
  });

  it('defaults equal the DEFAULTs of migration 001 (DECISIONS #57)', () => {
    expect(Object.keys(TECHNICAL_DEFAULTS)).toEqual([...TECHNICAL_COLUMNS]);
    expect(TECHNICAL_DEFAULTS).toEqual({
      _row_version: 1,
      lebtab_nutrition_stale: 0,
      lebtab_bemerkung: null,
    });
  });
});
