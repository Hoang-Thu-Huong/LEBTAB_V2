import { describe, it, expect } from 'vitest';
import {
  emptyFilters,
  readListState,
  buildListParams,
  buildListQueryString,
  canGoBackToList,
} from './listParams.js';

describe('canGoBackToList', () => {
  const ORIGIN = 'http://localhost:3000';
  it('is true when the previous page of THIS tab was the list', () => {
    expect(canGoBackToList(`${ORIGIN}/`, ORIGIN, 2)).toBe(true);
    expect(canGoBackToList(`${ORIGIN}/index.html?itemart=V&page=3`, ORIGIN, 5)).toBe(true);
  });
  it('is false in a new tab (Strg-/Mittelklick): referrer is the list, but there is no history', () => {
    expect(canGoBackToList(`${ORIGIN}/index.html?itemart=V`, ORIGIN, 1)).toBe(false);
  });
  it('is false for another page, another origin, or no referrer', () => {
    expect(canGoBackToList(`${ORIGIN}/detail.html?lmc=A1A100`, ORIGIN, 3)).toBe(false);
    expect(canGoBackToList('http://example.org/index.html', ORIGIN, 3)).toBe(false);
    expect(canGoBackToList('', ORIGIN, 3)).toBe(false);
  });
});

describe('readListState', () => {
  it('returns empty filters and page 1 for an empty URL', () => {
    expect(readListState('')).toEqual({ filters: emptyFilters(), page: 1 });
  });
  it('reads and trims the 4 filters and a valid page', () => {
    const s = readListState('?search=%20K%C3%A4se%20&itemart=V&datum_from=2020-01-01&datum_to=2020-12-31&page=7&foo=1');
    expect(s).toEqual({
      filters: { search: 'Käse', itemart: 'V', datum_from: '2020-01-01', datum_to: '2020-12-31' },
      page: 7,
    });
  });
  it('falls back to page 1 for garbage', () => {
    for (const p of ['0', '-3', '1e2', 'abc', '1.5']) expect(readListState(`?page=${p}`).page).toBe(1);
  });
});

describe('buildListParams', () => {
  it('omits empty filters — never the string "undefined"', () => {
    const params = buildListParams({ search: '  ', itemart: '', datum_from: undefined, datum_to: null }, 1, 20);
    expect(params).toEqual({ page: 1, pageSize: 20 });
    expect(new URLSearchParams(params).toString()).toBe('page=1&pageSize=20');
  });
  it('keeps trimmed non-empty filters', () => {
    expect(buildListParams({ ...emptyFilters(), search: ' 3,5%F ', itemart: 'N' }, 2, 20)).toEqual({
      search: '3,5%F', itemart: 'N', page: 2, pageSize: 20,
    });
  });
});

describe('buildListQueryString', () => {
  it('is empty for no filters on page 1', () => {
    expect(buildListQueryString(emptyFilters(), 1)).toBe('');
  });
  it('contains filters and page > 1, never pageSize, and round-trips through readListState', () => {
    const filters = { ...emptyFilters(), search: '3,5%F', itemart: 'V' };
    const qs = buildListQueryString(filters, 3);
    expect(qs).toBe('?search=3%2C5%25F&itemart=V&page=3');
    expect(readListState(qs)).toEqual({ filters, page: 3 });
  });
});
