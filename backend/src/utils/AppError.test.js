import { describe, it, expect } from 'vitest';
import { AppError } from './AppError.js';

describe('AppError', () => {
  it('carries status, code, message and optional details', () => {
    const err = new AppError(400, 'VALIDATION_ERROR', 'Ungültige Eingabe', [
      { field: 'lebtab_lmc', issue: 'muss 6 Zeichen haben' },
    ]);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Ungültige Eingabe');
    expect(err.details).toEqual([{ field: 'lebtab_lmc', issue: 'muss 6 Zeichen haben' }]);
    expect(err.name).toBe('AppError');
  });

  it('details defaults to undefined', () => {
    const err = new AppError(404, 'PRODUCT_NOT_FOUND', 'Produkt nicht gefunden');
    expect(err.details).toBeUndefined();
  });
});
