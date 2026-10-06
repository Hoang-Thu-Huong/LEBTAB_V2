import { describe, it, expect } from 'vitest';
import { NUTRITION_COLUMNS } from './nutritionColumns.js';
import { BASIC_COLUMNS, CLASSIFICATION_COLUMNS, TECHNICAL_COLUMNS } from './productColumns.js';

describe('NUTRITION_COLUMNS', () => {
  it('has exactly 79 unique columns, all prefixed lebtab_', () => {
    expect(NUTRITION_COLUMNS).toHaveLength(79);
    expect(new Set(NUTRITION_COLUMNS).size).toBe(79);
    expect(NUTRITION_COLUMNS.every((c) => c.startsWith('lebtab_'))).toBe(true);
    expect(Object.isFrozen(NUTRITION_COLUMNS)).toBe(true);
  });

  it('contains no basic, classification or technical column', () => {
    for (const c of [...BASIC_COLUMNS, ...CLASSIFICATION_COLUMNS, ...TECHNICAL_COLUMNS]) {
      expect(NUTRITION_COLUMNS).not.toContain(c);
    }
  });

  it('keeps the case-sensitive spelling of the DDL (DATA.md 4.1)', () => {
    for (const c of ['lebtab_v_A', 'lebtab_v_e', 'lebtab_FiB', 'lebtab_t_ew', 'lebtab_Gluc', 'lebtab_zuzu']) {
      expect(NUTRITION_COLUMNS).toContain(c);
    }
    expect(NUTRITION_COLUMNS).not.toContain('lebtab_V_A');
    expect(NUTRITION_COLUMNS).not.toContain('lebtab_FIB');
  });

  it('starts with E_CAL and ends with NESSAS (DDL order)', () => {
    expect(NUTRITION_COLUMNS[0]).toBe('lebtab_E_CAL');
    expect(NUTRITION_COLUMNS[78]).toBe('lebtab_NESSAS');
  });
});
