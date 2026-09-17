import { pool } from '../config/db.js';

/**
 * Prueft die DB-Verbindung mit SELECT 1 (docs/SPEC.md 6.1 #0).
 * Bei gestoppter DB wirft mysql2 (ECONNREFUSED) -> errorHandler -> 503 DB_UNAVAILABLE.
 * @returns {Promise<{status: 'ok', db: 'connected'}>}
 */
export async function check() {
  await pool.query('SELECT 1');
  return { status: 'ok', db: 'connected' };
}
