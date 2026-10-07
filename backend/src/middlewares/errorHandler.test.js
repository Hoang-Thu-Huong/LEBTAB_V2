import { describe, it, expect, vi } from 'vitest';
import multer from 'multer';
import { errorHandler } from './errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

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

  it('logs a deliberate 5xx AppError (503 MIGRATION_REQUIRED) with code + path but without a stack', () => {
    const res = mockRes();
    logger.error.mockClear();
    errorHandler(new AppError(503, 'MIGRATION_REQUIRED', 'Migration fehlt'), { originalUrl: '/api/products' }, res, () => {});
    expect(res.statusCode).toBe(503);
    expect(logger.error).toHaveBeenCalledWith('MIGRATION_REQUIRED', { path: '/api/products' });
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

  it.each(['ECONNRESET', 'EPIPE', 'ENOTFOUND'])('maps %s to 503 DB_UNAVAILABLE', (code) => {
    const res = mockRes();
    const dbErr = new Error(`connect ${code}`);
    dbErr.code = code;
    errorHandler(dbErr, { originalUrl: '/api/products' }, res, () => {});
    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe('DB_UNAVAILABLE');
  });

  it('maps the router URIError (broken % escape in the path) to 404 NOT_FOUND without logging', () => {
    vi.clearAllMocks();
    const res = mockRes();
    const err = new URIError("Failed to decode param '%E0%A4%A'");
    err.status = 400; // so markiert der Express-Router den Fehler (DECISIONS #68)
    errorHandler(err, { originalUrl: '/api/products/%E0%A4%A' }, res, () => {});
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Endpunkt nicht gefunden', status: 404 },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps a URIError thrown by application code a 500', () => {
    const res = mockRes();
    errorHandler(new URIError('URI malformed'), { originalUrl: '/api/x' }, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it.each([
    ['LIMIT_FILE_SIZE', 'Datei zu groß (maximal 10 MB)'],
    ['LIMIT_FILE_COUNT', 'Zu viele Dateien (maximal 10 pro Upload)'],
    ['LIMIT_UNEXPECTED_FILE', 'Unerwartetes Dateifeld (erwartet: photos)'],
    ['LIMIT_PART_COUNT', 'Upload fehlgeschlagen'],
  ])('maps MulterError %s to 400 INVALID_FILE without logging', (code, message) => {
    vi.clearAllMocks();
    const res = mockRes();
    errorHandler(new multer.MulterError(code, 'photos'), { originalUrl: '/api/products/A1CK00/photos' }, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: 'INVALID_FILE', message, status: 400 } });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    ['entity.parse.failed', 'Ungültiges JSON im Request-Body'],
    ['entity.too.large', 'Anfrage zu groß (maximal 1 MB)'],
    ['charset.unsupported', 'Zeichensatz der Anfrage wird nicht unterstützt'],
    ['encoding.unsupported', 'Kodierung der Anfrage wird nicht unterstützt'],
  ])('maps the express.json error %s to 400 VALIDATION_ERROR without logging (DECISIONS #89)', (type, message) => {
    vi.clearAllMocks();
    const res = mockRes();
    const err = new Error('body-parser');
    err.type = type;
    err.status = type === 'entity.too.large' ? 413 : 400;
    errorHandler(err, { originalUrl: '/api/products' }, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message, status: 400 } });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps an unknown body-parser type (e.g. request.aborted) a 500', () => {
    const res = mockRes();
    const err = new Error('aborted');
    err.type = 'request.aborted';
    errorHandler(err, { originalUrl: '/api/products' }, res, () => {});
    expect(res.statusCode).toBe(500);
  });
});
