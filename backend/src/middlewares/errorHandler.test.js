import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { AppError } from '../utils/AppError.js';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockRes() {
  const res = { statusCode: 0, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('errorHandler', () => {
  it('formats AppError with details', () => {
    const res = mockRes();
    errorHandler(
      new AppError(400, 'VALIDATION_ERROR', 'Ungültig', [{ field: 'x', issue: 'y' }]),
      { originalUrl: '/api/x' },
      res,
      () => {},
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Ungültig',
        status: 400,
        details: [{ field: 'x', issue: 'y' }],
      },
    });
  });

  it('hides internals for unknown errors', () => {
    const res = mockRes();
    const dbErr = new Error('boom');
    dbErr.sqlMessage = 'SECRET';
    errorHandler(dbErr, { originalUrl: '/api/x' }, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Interner Serverfehler', status: 500 },
    });
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });

  it('maps connection errors to 503 DB_UNAVAILABLE', () => {
    const res = mockRes();
    const dbErr = new Error('connect ECONNREFUSED 127.0.0.1:3306');
    dbErr.code = 'ECONNREFUSED';
    errorHandler(dbErr, { originalUrl: '/api/health' }, res, () => {});
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: { code: 'DB_UNAVAILABLE', message: 'Datenbank nicht erreichbar', status: 503 },
    });
  });
});
