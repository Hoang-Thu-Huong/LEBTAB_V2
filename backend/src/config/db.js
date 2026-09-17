import './env.js';
import mysql from 'mysql2/promise';

/**
 * Gemeinsamer Verbindungspool (docs/ARCHITECTURE.md 3.2).
 * decimalNumbers: DOUBLE/DECIMAL -> number. dateStrings: DATE/DATETIME bleiben Strings (keine Zeitzonen-Umrechnung).
 * connectTimeout 3 s: bei gestoppter MariaDB schnell 503 statt 10 s Haengen.
 */
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  connectTimeout: 3000,
  decimalNumbers: true,
  dateStrings: true,
});
