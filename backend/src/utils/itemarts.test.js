import { describe, it, expect } from 'vitest';
import { ITEMARTS } from './itemarts.js';

describe('ITEMARTS', () => {
  it('has exactly the 7 fixed values, sorted, unique, frozen', () => {
    expect(ITEMARTS).toEqual(['A', 'L', 'M', 'N', 'R', 'S', 'V']);
    expect(new Set(ITEMARTS).size).toBe(7);
    expect([...ITEMARTS].sort()).toEqual([...ITEMARTS]);
    expect(Object.isFrozen(ITEMARTS)).toBe(true);
  });
});
