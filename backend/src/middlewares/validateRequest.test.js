import { describe, it, expect, vi } from 'vitest';
import { validateRequest } from './validateRequest.js';
import { AppError } from '../utils/AppError.js';

describe('validateRequest', () => {
  it('stores the parsed value in req.validated and calls next() without argument', () => {
    const parse = vi.fn(() => ({ ok: true }));
    const req = { body: { raw: 1 } };
    const next = vi.fn();
    validateRequest(parse)(req, {}, next);
    expect(parse).toHaveBeenCalledWith({ raw: 1 });
    expect(req.validated).toEqual({ ok: true });
    expect(next).toHaveBeenCalledWith();
  });

  it('passes a thrown AppError to next(err) and leaves req.validated undefined', () => {
    const err = new AppError(400, 'VALIDATION_ERROR', 'Ungültig', []);
    const req = { body: undefined };
    const next = vi.fn();
    validateRequest(() => {
      throw err;
    })(req, {}, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(req.validated).toBeUndefined();
  });
});
