import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  CSV_BOM,
  CSV_CHUNK_SIZE,
  CSV_LINE_END,
  CSV_SEPARATOR,
  numberToString,
  toCsvField,
  toCsvLine,
  createCsvStream,
} from './csvFormatter.js';
import { parseCsv } from './csvFormatter.testutil.js';
import { formatNumber } from '../../../frontend/js/utils/format.js';

/** Laesst rows durch createCsvStream laufen und liefert die ausgegebenen Bloecke. */
async function runCsv(columns, rows) {
  const chunks = [];
  await pipeline(Readable.from(rows), createCsvStream(columns), async (source) => {
    for await (const chunk of source) chunks.push(String(chunk));
  });
  return chunks;
}

describe('constants (DECISIONS #3)', () => {
  it('uses comma, CRLF and the UTF-8 byte order mark', () => {
    expect(CSV_SEPARATOR).toBe(',');
    expect(CSV_LINE_END).toBe('\r\n');
    expect(Buffer.from(CSV_BOM, 'utf8')).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });
});

describe('numberToString — exactly as stored, decimal point, never exponent notation', () => {
  it('keeps ordinary values verbatim without rounding', () => {
    expect(numberToString(12.5)).toBe('12.5');
    expect(numberToString(100)).toBe('100');
    expect(numberToString(0)).toBe('0');
    expect(numberToString(-3.25)).toBe('-3.25');
    expect(numberToString(0.0004)).toBe('0.0004');
    expect(numberToString(0.11912750000000001)).toBe('0.11912750000000001');
    expect(numberToString(99.99999999999999)).toBe('99.99999999999999');
    expect(numberToString(500000)).toBe('500000');
  });

  it('expands exponent notation in both directions', () => {
    expect(numberToString(1e-7)).toBe('0.0000001');
    expect(numberToString(-2.5e-8)).toBe('-0.000000025');
    expect(numberToString(1.5e21)).toBe('1500000000000000000000');
    expect(numberToString(1.234e-10)).toBe('0.0000000001234');
  });

  it('never uses a thousands separator or a decimal comma', () => {
    expect(numberToString(1234567.891)).toBe('1234567.891');
  });

  it('gives an empty string for NaN and Infinity', () => {
    expect(numberToString(NaN)).toBe('');
    expect(numberToString(Infinity)).toBe('');
    expect(numberToString(-Infinity)).toBe('');
  });

  it('agrees with formatNumber of the frontend for every finite value (ARCHITECTURE 7.7)', () => {
    const samples = [0, 1, -1, 0.1, 12.5, 1e-7, 2.5e-8, -4e-9, 1e21, 1.5e21, 123456789.123, 0.30000000000000004, 5e-324];
    for (const n of samples) expect(numberToString(n)).toBe(formatNumber(n));
  });

  it('round-trips: Number(numberToString(n)) === n', () => {
    for (const n of [0.11912750000000001, 1e-7, 4.1579, 99.99999999999999, 1.7, 5e-324, 1.5e21]) {
      expect(Number(numberToString(n))).toBe(n);
    }
  });
});

describe('toCsvField', () => {
  it('writes NULL as an empty field and an empty string as ""', () => {
    expect(toCsvField(null)).toBe('');
    expect(toCsvField(undefined)).toBe('');
    expect(toCsvField('')).toBe('""');
  });

  it('writes numbers with numberToString, including 0', () => {
    expect(toCsvField(0)).toBe('0');
    expect(toCsvField(3)).toBe('3');
    expect(toCsvField(1e-7)).toBe('0.0000001');
  });

  it('leaves plain text, umlauts, semicolons and dates unquoted', () => {
    expect(toCsvField('Käse 3.5%F')).toBe('Käse 3.5%F');
    expect(toCsvField('a;b')).toBe('a;b');
    expect(toCsvField('2016-07-26')).toBe('2016-07-26');
  });

  it('quotes fields containing comma, quote, CR or LF and doubles quotes', () => {
    expect(toCsvField('Milch 3,5%F')).toBe('"Milch 3,5%F"');
    expect(toCsvField('Joghurt "Activia"')).toBe('"Joghurt ""Activia"""');
    expect(toCsvField('Zeile 1\r\nZeile 2')).toBe('"Zeile 1\r\nZeile 2"');
    expect(toCsvField('a\nb')).toBe('"a\nb"');
    expect(toCsvField('a\rb')).toBe('"a\rb"');
    expect(toCsvField('"')).toBe('""""');
  });

  it('quotes leading and trailing whitespace so that no reader trims it', () => {
    expect(toCsvField(' x')).toBe('" x"');
    expect(toCsvField('x ')).toBe('"x "');
    expect(toCsvField('\tx')).toBe('"\tx"');
    expect(toCsvField('a b')).toBe('a b');
  });

  it('keeps values that Excel would reinterpret exactly as stored (DECISIONS #84)', () => {
    expect(toCsvField('000100')).toBe('000100');
    expect(toCsvField('160E00')).toBe('160E00');
    expect(toCsvField('=IFA0 (o')).toBe('=IFA0 (o');
    expect(toCsvField('-')).toBe('-');
    expect(toCsvField('+49')).toBe('+49');
    expect(toCsvField('@home')).toBe('@home');
  });
});

describe('toCsvLine', () => {
  it('joins fields with commas and ends with CRLF', () => {
    expect(toCsvLine(['A1CK00', 'Milch 3,5%F', null, 3, 12.5])).toBe('A1CK00,"Milch 3,5%F",,3,12.5\r\n');
  });

  it('writes a line of only NULLs as bare separators', () => {
    expect(toCsvLine([null, null, null])).toBe(',,\r\n');
  });
});

describe('createCsvStream', () => {
  const COLUMNS = ['code', 'name', 'wert'];

  it('starts with BOM + header exactly once, then one line per row', async () => {
    const text = (await runCsv(COLUMNS, [
      { code: 'A', name: 'eins', wert: 1 },
      { code: 'B', name: 'zwei', wert: null },
    ])).join('');
    expect(text).toBe(CSV_BOM + 'code,name,wert\r\nA,eins,1\r\nB,zwei,\r\n');
    expect(text.split(CSV_BOM)).toHaveLength(2);
  });

  it('emits BOM + header even when there is no row at all', async () => {
    expect((await runCsv(COLUMNS, [])).join('')).toBe(CSV_BOM + 'code,name,wert\r\n');
  });

  it('takes the column order from `columns`, not from the key order of the row', async () => {
    const text = (await runCsv(COLUMNS, [{ wert: 7, name: 'n', code: 'C', extra: 'ignored' }])).join('');
    expect(text).toBe(CSV_BOM + 'code,name,wert\r\nC,n,7\r\n');
  });

  it('writes a missing key as an empty field instead of "undefined"', async () => {
    const text = (await runCsv(COLUMNS, [{ code: 'D' }])).join('');
    expect(text).toBe(CSV_BOM + 'code,name,wert\r\nD,,\r\n');
  });

  it('hands data on in blocks instead of collecting the whole file', async () => {
    const rows = Array.from({ length: 20000 }, (_, i) => ({ code: `C${i}`, name: 'x'.repeat(20), wert: i }));
    const chunks = await runCsv(COLUMNS, rows);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.length).toBeLessThan(CSV_CHUNK_SIZE + 200);
    expect(chunks.join('').split(CSV_LINE_END)).toHaveLength(20000 + 2); // Kopfzeile + Zeilen + leeres Ende
  });

  it('never splits a row across two blocks', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ code: `C${i}`, name: 'y'.repeat(50), wert: i }));
    for (const chunk of await runCsv(COLUMNS, rows)) expect(chunk.endsWith(CSV_LINE_END)).toBe(true);
  });

  it('produces a file that parses back to the original values, however awkward they are', async () => {
    const rows = [
      { code: '000100', name: 'Viol "Creamy", vegan\r\nBrotbelag mit Kokosöl', wert: 0.11912750000000001 },
      { code: '160E00', name: '=IFA0 (o', wert: 1e-7 },
      { code: 'YKH000', name: '', wert: null },
      { code: 'ÄÖÜ ß', name: ' führendes Leerzeichen', wert: -0.5 },
      { code: 'E', name: 'Zeile\nnur LF, und ""doppelt""', wert: 0 },
    ];
    const text = (await runCsv(COLUMNS, rows)).join('');
    const records = parseCsv(text.slice(CSV_BOM.length));
    expect(records[0]).toEqual(COLUMNS);
    expect(records.slice(1)).toEqual(
      rows.map((row) => [row.code, row.name, row.wert === null ? null : numberToString(row.wert)]),
    );
  });
});
