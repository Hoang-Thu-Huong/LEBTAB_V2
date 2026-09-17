import { describe, it, expect } from 'vitest';
import { formatNumber, parseDecimal, formatDate, salzFromNatrium, todayLocal } from './format.js';

describe('formatNumber — unveraendert, ohne Rundung (ARCHITECTURE.md 7.7)', () => {
  it('shows DB value verbatim', () => {
    expect(formatNumber(0.0004)).toBe('0.0004');
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(0)).toBe('0');
  });
  it('expands exponent notation', () => {
    expect(formatNumber(1e-7)).toBe('0.0000001');
    expect(formatNumber(-2.5e-8)).toBe('-0.000000025');
    expect(formatNumber(1.5e21)).toBe('1500000000000000000000');
  });
  it('returns dash for null/undefined/NaN', () => {
    expect(formatNumber(null)).toBe('–');
    expect(formatNumber(undefined)).toBe('–');
    expect(formatNumber('abc')).toBe('–');
  });
});

describe('parseDecimal', () => {
  it('accepts German comma', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal(' 7 ')).toBe(7);
    expect(parseDecimal('0')).toBe(0);
  });
  it('returns null for empty/invalid', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });
});

describe('formatDate', () => {
  it('YYYY-MM-DD -> DD.MM.YYYY', () => {
    expect(formatDate('2026-08-01')).toBe('01.08.2026');
  });
  it('null/invalid -> dash', () => {
    expect(formatDate(null)).toBe('–');
    expect(formatDate('2026/08/01')).toBe('–');
  });
});

describe('salzFromNatrium', () => {
  it('Natrium mg * 2.5 / 1000 = Salz g', () => {
    expect(salzFromNatrium(400)).toBe(1);
    expect(salzFromNatrium(0)).toBe(0);
  });
  it('null -> null', () => {
    expect(salzFromNatrium(null)).toBeNull();
    expect(salzFromNatrium(undefined)).toBeNull();
  });
});

describe('todayLocal', () => {
  it('uses local calendar date, not UTC', () => {
    // 23:30 Ortszeit am 01.08.2026 — toISOString() waere in Deutschland (UTC+2) bereits der 02.08.
    const d = new Date(2026, 7, 1, 23, 30, 0);
    expect(todayLocal(d)).toBe('2026-08-01');
  });
  it('pads month and day', () => {
    expect(todayLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
