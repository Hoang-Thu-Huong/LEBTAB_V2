import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger.js';

afterEach(() => vi.restoreAllMocks());

describe('logger', () => {
  it('info writes ISO timestamp, level and message to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('Server gestartet', { port: 3000 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0];
    expect(line).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Server gestartet \{"port":3000\}$/,
    );
  });

  it('warn uses console.warn, error uses console.error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.warn('Achtung');
    logger.error('Fehler');
    expect(warn.mock.calls[0][0]).toMatch(/\[WARN\] Achtung$/);
    expect(error.mock.calls[0][0]).toMatch(/\[ERROR\] Fehler$/);
  });
});
