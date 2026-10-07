import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, once } from 'node:events';
import { Readable, Writable } from 'node:stream';

vi.mock('../config/db.js', () => ({ pool: { getConnection: vi.fn() } }));
vi.mock('../models/lebtabModel.js', () => ({ streamExportRows: vi.fn() }));
vi.mock('../models/czutabModel.js', () => ({ streamExportRows: vi.fn(), findColumnNames: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { pool } from '../config/db.js';
import * as lebtabModel from '../models/lebtabModel.js';
import * as czutabModel from '../models/czutabModel.js';
import { logger } from '../utils/logger.js';
import { CSV_BOM, CSV_CHUNK_SIZE } from '../utils/csvFormatter.js';
import { LEBTAB_EXPORT_COLUMNS } from '../utils/exportColumns.js';
import { EXPORT_TYPES, parseExportType, exportFilename, streamExport } from './exportService.js';

const LEBTAB_HEADER = `${CSV_BOM}${LEBTAB_EXPORT_COLUMNS.join(',')}\r\n`;
/** Was czutabModel.findColumnNames heute liefert — der Export selbst kennt keine feste Spaltenliste. */
const CZUTAB_COLUMNS = ['id', 'LMC', 'LM_Zutat', 'Menge', 'Version', 'Anrcode'];
const CZUTAB_HEADER = `${CSV_BOM}${CZUTAB_COLUMNS.join(',')}\r\n`;
const ZUTAT = { id: 7, LMC: 'A1CK00', LM_Zutat: '000100', Menge: 12.5, Version: 3, Anrcode: 0 };
/** Genug Zeilen fuer mehrere Ausgabebloecke (jede Zeile ~30 Zeichen). */
const MANY = Math.ceil((CSV_CHUNK_SIZE * 3) / 30);
/** Viel mehr, als ein abgebrochener Export je liest — aber endlich, damit ein Fehler im Code den Testlauf nicht aufhaengt. */
const ENDLESS = MANY * 30;

let conn;

/** Writable, das alles einsammelt; `options` z. B. fuer einen kleinen highWaterMark. */
function collector(options = {}) {
  const chunks = [];
  const output = new Writable({
    ...options,
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      setImmediate(callback);
    },
  });
  return { output, text: () => Buffer.concat(chunks).toString('utf8') };
}

function* zutatRows(count, failAt = -1, error = null) {
  for (let i = 0; i < count; i += 1) {
    if (i === failAt) throw error;
    yield { ...ZUTAT, id: i + 1 };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // Die rohe mysql2-Verbindung ist ein EventEmitter: Verbindungsverluste kommen als 'error' auf ihr an, nicht im Stream
  conn = { connection: Object.assign(new EventEmitter(), { raw: true }), release: vi.fn(), destroy: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
  czutabModel.findColumnNames.mockResolvedValue(CZUTAB_COLUMNS);
});

/** Zeilen-Stream, der `count` Zeilen liefert und dann STUMM bleibt (weder end noch error) — wie mysql2 nach Verbindungsverlust. */
function stallingRows(count) {
  let i = 0;
  return new Readable({
    objectMode: true,
    read() {
      if (i < count) this.push({ ...ZUTAT, id: (i += 1) });
    },
  });
}

describe('parseExportType', () => {
  it('knows exactly the two tables of SPEC #12', () => {
    expect([...EXPORT_TYPES]).toEqual(['lebtab', 'c_zutab']);
    expect(parseExportType({ type: 'lebtab' })).toBe('lebtab');
    expect(parseExportType({ type: 'c_zutab' })).toBe('c_zutab');
  });

  it.each([
    ['missing', {}],
    ['empty', { type: '' }],
    ['other case', { type: 'LEBTAB' }],
    ['with spaces', { type: ' lebtab' }],
    ['archive table', { type: 'lebtab_archive' }],
    ['prototype key', { type: '__proto__' }],
    ['inherited key', { type: 'constructor' }],
    ['repeated parameter', { type: ['lebtab', 'c_zutab'] }],
    ['nested parameter', { type: { a: 'lebtab' } }],
  ])('rejects a %s type with 400 VALIDATION_ERROR on field type', (_label, query) => {
    let thrown;
    try {
      parseExportType(query);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Ungültige Anfrageparameter',
      details: [{ field: 'type', issue: 'muss lebtab oder c_zutab sein' }],
    });
  });

  it('rejects a missing query object as well', () => {
    expect(() => parseExportType(undefined)).toThrow('Ungültige Anfrageparameter');
  });
});

describe('exportFilename', () => {
  it('uses the local calendar date of the server, not UTC', () => {
    // 00:30 Ortszeit am 02.08. ist in UTC noch der 01.08. (22:30) — toISOString() wuerde den Vortag liefern.
    expect(exportFilename('lebtab', new Date(2026, 7, 2, 0, 30))).toBe('lebtab_export_2026-08-02.csv');
  });

  it('pads month and day and carries the type', () => {
    expect(exportFilename('c_zutab', new Date(2027, 0, 5))).toBe('c_zutab_export_2027-01-05.csv');
  });
});

describe('streamExport — success', () => {
  it('writes BOM, the 92 header columns and one line per product; releases the connection', async () => {
    const row = Object.fromEntries(LEBTAB_EXPORT_COLUMNS.map((column) => [column, null]));
    Object.assign(row, { lebtab_lmc: '000100', lebtab_Bezeich: 'Milch 3,5%F', lebtab_E_CAL: 64.5 });
    lebtabModel.streamExportRows.mockReturnValue(Readable.from([row]));
    const { output, text } = collector();
    const onStart = vi.fn();

    const result = await streamExport('lebtab', output, onStart);

    expect(lebtabModel.streamExportRows).toHaveBeenCalledWith(conn.connection);
    expect(czutabModel.streamExportRows).not.toHaveBeenCalled();
    expect(czutabModel.findColumnNames).not.toHaveBeenCalled(); // lebtab: feste 92 Spalten, nie aus dem Schema
    const line = ['000100', '"Milch 3,5%F"', ...LEBTAB_EXPORT_COLUMNS.slice(2).map((c) => (c === 'lebtab_E_CAL' ? '64.5' : ''))];
    expect(text()).toBe(`${LEBTAB_HEADER}${line.join(',')}\r\n`);
    expect(result).toEqual({ bytes: Buffer.byteLength(text()), aborted: false });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
    expect(conn.destroy).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('CSV-Export', expect.objectContaining({ type: 'lebtab', bytes: result.bytes }));
  });

  it('reads the header of c_zutab from the table, on the borrowed connection, and uses the model of c_zutab', async () => {
    czutabModel.streamExportRows.mockReturnValue(Readable.from([ZUTAT]));
    const { output, text } = collector();
    await streamExport('c_zutab', output, vi.fn());
    expect(czutabModel.findColumnNames).toHaveBeenCalledWith(conn);
    expect(czutabModel.streamExportRows).toHaveBeenCalledWith(conn.connection);
    expect(lebtabModel.streamExportRows).not.toHaveBeenCalled();
    expect(text()).toBe(`${CZUTAB_HEADER}7,A1CK00,000100,12.5,3,0\r\n`);
  });

  it('exports c_zutab as it is: a column added to the table appears without a code change', async () => {
    czutabModel.findColumnNames.mockResolvedValue([...CZUTAB_COLUMNS, 'neu']);
    czutabModel.streamExportRows.mockReturnValue(Readable.from([{ ...ZUTAT, neu: 'x' }, { ...ZUTAT, id: 8, neu: null }]));
    const { output, text } = collector();
    await streamExport('c_zutab', output, vi.fn());
    expect(text()).toBe(
      `${CSV_BOM}id,LMC,LM_Zutat,Menge,Version,Anrcode,neu\r\n7,A1CK00,000100,12.5,3,0,x\r\n8,A1CK00,000100,12.5,3,0,\r\n`,
    );
  });

  it('calls onStart before the first byte is written', async () => {
    czutabModel.streamExportRows.mockReturnValue(Readable.from([ZUTAT]));
    let startedBeforeFirstWrite = null;
    const onStart = vi.fn();
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        if (startedBeforeFirstWrite === null) startedBeforeFirstWrite = onStart.mock.calls.length === 1;
        callback();
      },
    });
    await streamExport('c_zutab', output, onStart);
    expect(startedBeforeFirstWrite).toBe(true);
  });

  it('never ends or destroys the output — that is the job of the caller', async () => {
    czutabModel.streamExportRows.mockReturnValue(Readable.from([ZUTAT]));
    const { output } = collector();
    await streamExport('c_zutab', output, vi.fn());
    expect(output.writableEnded).toBe(false);
    expect(output.destroyed).toBe(false);
    expect(output.listenerCount('close')).toBe(0);
  });

  it('exports an empty table as BOM + header only', async () => {
    czutabModel.streamExportRows.mockReturnValue(Readable.from([]));
    const { output, text } = collector();
    const onStart = vi.fn();
    const result = await streamExport('c_zutab', output, onStart);
    expect(text()).toBe(CZUTAB_HEADER);
    expect(result.aborted).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  it('waits for drain instead of writing into a full output (slow client)', async () => {
    czutabModel.streamExportRows.mockReturnValue(Readable.from(zutatRows(MANY)));
    const { output, text } = collector({ highWaterMark: 1024 });
    const write = output.write.bind(output);
    let writesWhileFull = 0;
    let writes = 0;
    output.write = (chunk) => {
      writes += 1;
      if (output.writableNeedDrain) writesWhileFull += 1;
      return write(chunk);
    };
    await streamExport('c_zutab', output, vi.fn());
    expect(writes).toBeGreaterThan(2);
    expect(writesWhileFull).toBe(0);
    const lines = text().split('\r\n');
    expect(lines).toHaveLength(MANY + 2);
    expect(lines[1]).toBe('1,A1CK00,000100,12.5,3,0');
    expect(lines[MANY]).toBe(`${MANY},A1CK00,000100,12.5,3,0`);
  });
});

describe('streamExport — failures', () => {
  it('passes a connection error on untouched and writes nothing (database down)', async () => {
    const down = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    pool.getConnection.mockRejectedValue(down);
    const { output, text } = collector();
    const onStart = vi.fn();
    await expect(streamExport('lebtab', output, onStart)).rejects.toBe(down);
    expect(onStart).not.toHaveBeenCalled();
    expect(text()).toBe('');
    expect(lebtabModel.streamExportRows).not.toHaveBeenCalled();
  });

  it('rejects before onStart when the column names of c_zutab cannot be read; destroys the connection', async () => {
    const lost = Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' });
    czutabModel.findColumnNames.mockRejectedValue(lost);
    const { output, text } = collector();
    const onStart = vi.fn();
    await expect(streamExport('c_zutab', output, onStart)).rejects.toBe(lost);
    expect(onStart).not.toHaveBeenCalled();
    expect(text()).toBe('');
    expect(czutabModel.streamExportRows).not.toHaveBeenCalled();
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
    expect(output.listenerCount('close')).toBe(0);
  });

  it('rejects before onStart when the query fails before the first row; destroys the connection', async () => {
    const sqlError = Object.assign(new Error("Unknown column 'lebtab_X'"), { code: 'ER_BAD_FIELD_ERROR' });
    lebtabModel.streamExportRows.mockReturnValue(
      new Readable({
        objectMode: true,
        read() {
          this.destroy(sqlError);
        },
      }),
    );
    const { output, text } = collector();
    const onStart = vi.fn();
    await expect(streamExport('lebtab', output, onStart)).rejects.toBe(sqlError);
    expect(onStart).not.toHaveBeenCalled();
    expect(text()).toBe('');
    expect(output.destroyed).toBe(false);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled(); // der errorHandler loggt diesen Fall
  });

  it('still reports a failure within the first block as "nothing written yet"', async () => {
    const lost = Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' });
    czutabModel.streamExportRows.mockReturnValue(Readable.from(zutatRows(50, 10, lost)));
    const { output, text } = collector();
    const onStart = vi.fn();
    await expect(streamExport('c_zutab', output, onStart)).rejects.toBe(lost);
    expect(onStart).not.toHaveBeenCalled();
    expect(text()).toBe('');
  });

  it('rejects after onStart when the database fails mid-stream; logs it and destroys the connection', async () => {
    const lost = Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' });
    czutabModel.streamExportRows.mockReturnValue(Readable.from(zutatRows(MANY, MANY - 5, lost)));
    const { output, text } = collector();
    const onStart = vi.fn();
    await expect(streamExport('c_zutab', output, onStart)).rejects.toBe(lost);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(text().startsWith(CZUTAB_HEADER)).toBe(true);
    expect(output.destroyed).toBe(false); // Abbruch der HTTP-Verbindung macht der Controller
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'CSV-Export abgebrochen',
      expect.objectContaining({ type: 'c_zutab', code: 'PROTOCOL_CONNECTION_LOST' }),
    );
  });
});

describe('streamExport — the connection itself dies (mysql2 reports it on the connection, the row stream stays silent)', () => {
  it('rejects after onStart when the connection emits error mid-stream; destroys the connection and stops listening', async () => {
    const lost = Object.assign(new Error('Connection lost: The server closed the connection.'), { code: 'PROTOCOL_CONNECTION_LOST' });
    const source = stallingRows(MANY);
    czutabModel.streamExportRows.mockReturnValue(source);
    const { output, text } = collector();
    const onStart = vi.fn(() => setImmediate(() => conn.connection.emit('error', lost)));
    await expect(streamExport('c_zutab', output, onStart)).rejects.toBe(lost);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(text().startsWith(CZUTAB_HEADER)).toBe(true);
    expect(source.destroyed).toBe(true);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
    expect(conn.connection.listenerCount('error')).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      'CSV-Export abgebrochen',
      expect.objectContaining({ type: 'c_zutab', code: 'PROTOCOL_CONNECTION_LOST' }),
    );
  });

  it('rejects before onStart when the connection dies while the query is still sorting (no row yet); writes nothing', async () => {
    const lost = Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' });
    const source = stallingRows(0);
    czutabModel.streamExportRows.mockImplementation(() => {
      setImmediate(() => conn.connection.emit('error', lost));
      return source;
    });
    const { output, text } = collector();
    const onStart = vi.fn();
    await expect(streamExport('c_zutab', output, onStart)).rejects.toBe(lost);
    expect(onStart).not.toHaveBeenCalled();
    expect(text()).toBe('');
    expect(source.destroyed).toBe(true);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.connection.listenerCount('error')).toBe(0);
    expect(logger.error).not.toHaveBeenCalled(); // vor dem ersten Byte meldet der errorHandler (503), nicht der Export
  });

  it('rejects even while waiting for drain of a stalled client when the connection dies', async () => {
    const lost = Object.assign(new Error('Connection lost'), { code: 'PROTOCOL_CONNECTION_LOST' });
    const source = stallingRows(MANY);
    czutabModel.streamExportRows.mockReturnValue(source);
    const output = new Writable({
      highWaterMark: 1,
      write() {
        setImmediate(() => conn.connection.emit('error', lost)); // Client nimmt nichts mehr ab (callback kommt nie), DB stirbt
      },
    });
    await expect(streamExport('c_zutab', output, vi.fn())).rejects.toBe(lost);
    expect(source.destroyed).toBe(true);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.connection.listenerCount('error')).toBe(0);
  });

  it('leaves no error listener behind after a successful export', async () => {
    czutabModel.streamExportRows.mockReturnValue(Readable.from(zutatRows(3)));
    const { output } = collector();
    await streamExport('c_zutab', output, vi.fn());
    expect(conn.connection.listenerCount('error')).toBe(0);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
});

describe('streamExport — receiver goes away', () => {
  it('stops reading, destroys the connection and resolves with aborted: true', async () => {
    const source = Readable.from(zutatRows(ENDLESS));
    czutabModel.streamExportRows.mockReturnValue(source);
    const output = new Writable({
      highWaterMark: 1,
      write() {
        setImmediate(() => output.destroy()); // Client bricht waehrend des ersten Blocks ab; callback kommt nie
      },
    });
    const result = await streamExport('c_zutab', output, vi.fn());
    expect(result.aborted).toBe(true);
    expect(source.destroyed).toBe(true);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('CSV-Export vom Client abgebrochen', expect.objectContaining({ type: 'c_zutab' }));
  });

  it('does not hang when the output was closed before the export could start', async () => {
    const source = Readable.from(zutatRows(ENDLESS));
    czutabModel.streamExportRows.mockReturnValue(source);
    const { output, text } = collector();
    output.destroy();
    await once(output, 'close'); // 'close' ist vorbei, bevor der Export beginnt
    const onStart = vi.fn();
    const result = await streamExport('c_zutab', output, onStart);
    expect(result).toEqual({ bytes: 0, aborted: true });
    expect(onStart).not.toHaveBeenCalled();
    expect(text()).toBe('');
    expect(source.destroyed).toBe(true);
    expect(conn.destroy).toHaveBeenCalledTimes(1);
  });
});
