import { describe, it, expect } from 'vitest';
import { parseListQuery } from './listQuery.js';

const NO_FILTERS = { search: null, itemarts: null, datumFrom: null, datumTo: null };

function issuesOf(query) {
  try {
    parseListQuery(query);
  } catch (err) {
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Ungültige Anfrageparameter' });
    return err.details;
  }
  throw new Error('expected parseListQuery to throw');
}

describe('parseListQuery — defaults and happy path', () => {
  it('applies defaults for an empty query', () => {
    expect(parseListQuery({})).toEqual({ filters: NO_FILTERS, page: 1, pageSize: 20 });
  });

  it('treats empty strings as "no filter" / default', () => {
    const q = { search: '  ', itemart: '', datum_from: '', datum_to: '', page: '', pageSize: '' };
    expect(parseListQuery(q)).toEqual({ filters: NO_FILTERS, page: 1, pageSize: 20 });
  });

  it('trims search, splits+trims+dedupes itemart, keeps dates', () => {
    const q = { search: ' 3,5%F ', itemart: 'V, N,V', datum_from: '2020-01-01', datum_to: '2020-01-01', page: '3', pageSize: '200' };
    expect(parseListQuery(q)).toEqual({
      filters: { search: '3,5%F', itemarts: ['V', 'N'], datumFrom: '2020-01-01', datumTo: '2020-01-01' },
      page: 3,
      pageSize: 200,
    });
  });

  it('accepts a one-sided date range and ignores unknown parameters', () => {
    expect(parseListQuery({ datum_to: '2019-12-31', foo: 'bar' }).filters).toEqual({
      ...NO_FILTERS,
      datumTo: '2019-12-31',
    });
  });
});

describe('parseListQuery — every violation is a 400 with the right field', () => {
  it.each([
    [{ itemart: 'X' }, 'itemart'],
    [{ itemart: 'v' }, 'itemart'],
    [{ itemart: 'V,,N' }, 'itemart'],
    [{ itemart: ',' }, 'itemart'],
    [{ datum_from: '2020-13-01' }, 'datum_from'],
    [{ datum_to: '01.08.2026' }, 'datum_to'],
    [{ datum_from: '2021-01-01', datum_to: '2020-01-01' }, 'datum_from'],
    [{ search: ['a', 'b'] }, 'search'],
    [{ itemart: ['V', 'N'] }, 'itemart'],
    [{ search: 'x'.repeat(256) }, 'search'],
    [{ page: '0' }, 'page'],
    [{ page: '1e2' }, 'page'],
    [{ page: '0x10' }, 'page'],
    [{ page: '1.0' }, 'page'],
    [{ pageSize: '201' }, 'pageSize'],
    [{ pageSize: '0' }, 'pageSize'],
  ])('%j -> field %s', (query, field) => {
    const details = issuesOf(query);
    expect(details).toHaveLength(1);
    expect(details[0].field).toBe(field);
    expect(typeof details[0].issue).toBe('string');
    expect(details[0].issue.length).toBeGreaterThan(0);
  });

  it('accepts search with exactly 255 characters', () => {
    expect(parseListQuery({ search: 'x'.repeat(255) }).filters.search).toHaveLength(255);
  });

  it('collects ALL violations in one error', () => {
    const details = issuesOf({ itemart: 'X', datum_from: 'nope', page: '-1', pageSize: '999' });
    expect(details.map((d) => d.field).sort()).toEqual(['datum_from', 'itemart', 'page', 'pageSize']);
  });

  it('reports a repeated parameter once, not twice', () => {
    expect(issuesOf({ page: ['1', '2'] })).toEqual([
      { field: 'page', issue: 'darf nur einmal angegeben werden' },
    ]);
  });
});
