import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { pool } from '../config/db.js';
import { CSV_BOM } from '../utils/csvFormatter.js';
import { parseCsv } from '../utils/csvFormatter.testutil.js';
import { LEBTAB_EXPORT_COLUMNS } from '../utils/exportColumns.js';
import { NUTRITION_COLUMNS } from '../utils/nutritionColumns.js';
import { TECHNICAL_COLUMNS } from '../utils/productColumns.js';

const dbUp = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch((e) => {
    console.warn(`[contract] DB nicht erreichbar, DB-Tests uebersprungen: ${e.code ?? e.message}`);
    return false;
  });
const app = createApp();
afterAll(() => pool.end());

const EXPORT_TIMEOUT = 60000;
/** Zahl wie Excel auf deutschem Windows sie erwartet: Dezimal-KOMMA, kein Tausenderpunkt, nie Exponent (DECISIONS #94). */
const PLAIN_NUMBER = /^-?\d+(,\d+)?$/;

/** Laedt den Export als Bytes und liefert { res, records } (records[0] = Kopfzeile, NULL = null). */
async function downloadCsv(type) {
  const res = await request(app)
    .get(`/api/export?type=${type}`)
    .buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  const text = res.body.toString('utf8');
  return { res, text, records: parseCsv(text.slice(CSV_BOM.length)) };
}

/** Spaltennamen von c_zutab in Tabellenreihenfolge — der Export nimmt die Tabelle, wie sie ist (SELECT *). */
async function czutabColumns() {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'c_zutab'
      ORDER BY ORDINAL_POSITION`,
  );
  return rows.map((row) => row.name);
}

async function countRows(table) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`);
  return Number(rows[0].total);
}

describe.skipIf(!dbUp)('GET /api/export?type=lebtab (#12, echte DB, nur SELECT)', () => {
  it(
    'delivers every product once with exactly the 92 original columns',
    async () => {
      const { res, text, records } = await downloadCsv('lebtab');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="lebtab_export_\d{4}-\d{2}-\d{2}\.csv"$/);
      expect(text.startsWith(CSV_BOM)).toBe(true);
      expect(text.endsWith('\r\n')).toBe(true);

      expect(records[0]).toEqual([...LEBTAB_EXPORT_COLUMNS]);
      for (const column of TECHNICAL_COLUMNS) expect(records[0]).not.toContain(column);
      expect(records.length - 1).toBe(await countRows('lebtab'));
      const wrongLength = records.filter((record) => record.length !== LEBTAB_EXPORT_COLUMNS.length);
      expect(wrongLength).toEqual([]); // Semikolons, Anfuehrungszeichen und Zeilenumbrueche in Namen zerreissen keine Zeile

      const lmcs = records.slice(1).map((record) => record[0]);
      expect(new Set(lmcs).size).toBe(lmcs.length);
      for (const lmc of lmcs) expect(lmc).toMatch(/^[A-Za-z0-9]{6}$/); // fuehrende Nullen bleiben erhalten
      const upper = lmcs.map((lmc) => lmc.toUpperCase());
      expect([...upper].sort()).toEqual(upper);
    },
    EXPORT_TIMEOUT,
  );

  it(
    'writes every nutrition value as a decimal number with a comma or leaves the field empty',
    async () => {
      const { records } = await downloadCsv('lebtab');
      expect(records.length).toBeGreaterThan(1);
      const first = LEBTAB_EXPORT_COLUMNS.indexOf(NUTRITION_COLUMNS[0]);
      const bad = [];
      for (const record of records.slice(1)) {
        for (let i = first; i < first + NUTRITION_COLUMNS.length; i += 1) {
          if (record[i] !== null && !PLAIN_NUMBER.test(record[i])) bad.push(`${record[0]}.${LEBTAB_EXPORT_COLUMNS[i]}=${record[i]}`);
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
    },
    EXPORT_TIMEOUT,
  );

  it(
    'contains the same values as GET /api/products/:lmc for the first, a middle and the last product',
    async () => {
      const { records } = await downloadCsv('lebtab');
      const picks = [records[1], records[Math.floor(records.length / 2)], records[records.length - 1]];
      for (const record of picks) {
        const { body: product } = await request(app).get(`/api/products/${record[0]}`);
        LEBTAB_EXPORT_COLUMNS.forEach((column, i) => {
          const expected = column in product ? product[column] : product.nutrition[column];
          const actual = typeof expected === 'number' && record[i] !== null ? Number(record[i].replace(',', '.')) : record[i];
          expect(actual, `${record[0]}.${column}`).toEqual(expected);
        });
      }
    },
    EXPORT_TIMEOUT,
  );
});

describe.skipIf(!dbUp)('GET /api/export?type=c_zutab (#12, echte DB, nur SELECT)', () => {
  it(
    'delivers every recipe row once with all columns of the table, grouped by product',
    async () => {
      const { res, text, records } = await downloadCsv('c_zutab');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="c_zutab_export_\d{4}-\d{2}-\d{2}\.csv"$/);
      expect(text.startsWith(CSV_BOM)).toBe(true);

      const columns = await czutabColumns();
      expect(columns).toEqual(expect.arrayContaining(['id', 'LMC', 'LM_Zutat', 'Menge']));
      expect(records[0]).toEqual(columns);
      expect(records.length - 1).toBe(await countRows('c_zutab'));
      expect(records.filter((record) => record.length !== columns.length)).toEqual([]);
      const [idAt, lmcAt, mengeAt] = ['id', 'LMC', 'Menge'].map((name) => columns.indexOf(name));

      const ids = new Set();
      let outOfOrder = 0;
      let badNumber = 0;
      for (let i = 1; i < records.length; i += 1) {
        const [id, lmc, menge] = [records[i][idAt], records[i][lmcAt], records[i][mengeAt]];
        ids.add(id);
        if (!PLAIN_NUMBER.test(menge) || !/^\d+$/.test(id)) badNumber += 1;
        if (i === 1) continue;
        const [prevId, prevLmc] = [records[i - 1][idAt], records[i - 1][lmcAt]];
        const a = prevLmc.toUpperCase();
        const b = lmc.toUpperCase();
        if (a > b || (a === b && Number(prevId) > Number(id))) outOfOrder += 1;
      }
      expect(ids.size).toBe(records.length - 1);
      expect(badNumber).toBe(0);
      expect(outOfOrder).toBe(0);
    },
    EXPORT_TIMEOUT,
  );

  it('leaves the connection pool usable after the exports', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => request(app).get('/api/health')));
    expect(results.map((res) => res.status)).toEqual(Array(20).fill(200));
  });
});

describe.skipIf(!dbUp)('GET /api/export — invalid type (echte DB)', () => {
  it('400 VALIDATION_ERROR for an unknown table, e.g. the backup tables', async () => {
    const res = await request(app).get('/api/export?type=lebtab_backup');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field: 'type', issue: 'muss lebtab oder c_zutab sein' }]);
  });
});
