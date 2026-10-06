import { describe, it, expect } from 'vitest';
import { NUTRITION_COLUMNS } from './nutritionColumns.js';
import { NUTRITION_FIELDS, NUTRITION_GROUPS } from './nutritionFields.js';

describe('NUTRITION_GROUPS', () => {
  it('has the 6 groups with short German labels (SPEC #13)', () => {
    expect(NUTRITION_GROUPS).toEqual([
      { id: 'energie', label: 'Energie' },
      { id: 'kohlenhydrate', label: 'Kohlenhydrate' },
      { id: 'fette', label: 'Fette' },
      { id: 'vitamine', label: 'Vitamine' },
      { id: 'mineralstoffe', label: 'Mineralstoffe' },
      { id: 'aminosaeuren', label: 'Aminosäuren' },
    ]);
  });
});

describe('NUTRITION_FIELDS', () => {
  it('has one field per column, same order', () => {
    expect(NUTRITION_FIELDS.map((f) => f.key)).toEqual([...NUTRITION_COLUMNS]);
  });

  it('label = key without lebtab_, unit = null, group is one of the 6', () => {
    const ids = NUTRITION_GROUPS.map((g) => g.id);
    for (const f of NUTRITION_FIELDS) {
      expect(f.label).toBe(f.key.replace(/^lebtab_/, ''));
      expect(f.unit).toBeNull();
      expect(ids).toContain(f.group);
    }
  });

  it('group boundaries match DATA.md 4.1 (11/13/11/14/10/20)', () => {
    const byGroup = (id) => NUTRITION_FIELDS.filter((f) => f.group === id).map((f) => f.key);
    const expected = {
      energie: [11, 'lebtab_E_CAL', 'lebtab_U_FIB'],
      kohlenhydrate: [13, 'lebtab_Gluc', 'lebtab_frzu'],
      fette: [11, 'lebtab_CHOL', 'lebtab_F226'],
      vitamine: [14, 'lebtab_v_A', 'lebtab_V_C'],
      mineralstoffe: [10, 'lebtab_NATR', 'lebtab_JOD'],
      aminosaeuren: [20, 'lebtab_ISO', 'lebtab_NESSAS'],
    };
    for (const [id, [count, first, last]] of Object.entries(expected)) {
      const keys = byGroup(id);
      expect(keys).toHaveLength(count);
      expect(keys[0]).toBe(first);
      expect(keys[keys.length - 1]).toBe(last);
    }
  });
});
