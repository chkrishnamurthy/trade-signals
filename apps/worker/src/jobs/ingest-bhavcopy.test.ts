import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { BhavcopyNotPublishedError, type BhavcopyRow } from '../sources/bhavcopy.js';

const db = vi.hoisted(() => ({
  upsertListings: vi.fn(),
  insertDailyCandles: vi.fn(),
  recordFeedIngestion: vi.fn(async () => undefined),
}));
vi.mock('@equitywise/db', () => db);

import { dailyCandleTs, ingestBhavcopy, toCandle } from './ingest-bhavcopy.js';

const log: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => log,
} as unknown as Logger;
const context = { db: {} } as unknown as WorkerContext;

function row(
  exchange: 'NSE' | 'BSE',
  symbol: string,
  code: string,
  date = '2026-09-24',
): BhavcopyRow {
  return {
    exchange,
    tradingDate: date,
    symbol,
    exchangeCode: code,
    isin: 'INE002A01018',
    series: exchange === 'BSE' ? 'A' : 'EQ',
    name: symbol,
    open: 100_00,
    high: 110_00,
    low: 95_00,
    close: 105_00,
    previousClose: 100_00,
    volume: 1000,
    value: null,
    trades: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.upsertListings.mockImplementation(
    async (_db, _provider, listings: { exchangeCode: string }[]) =>
      new Map(listings.map((l, i) => [l.exchangeCode, 100 + i])),
  );
  db.insertDailyCandles.mockImplementation(async (_db, _provider, rows: unknown[]) => rows.length);
});

describe('toCandle', () => {
  it('stamps a closed session at UTC midnight of its trading date, prices untouched', () => {
    expect(dailyCandleTs('2026-09-24').toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(toCandle(row('BSE', 'RELIANCE', '500325'), 7)).toEqual({
      instrumentId: 7,
      ts: new Date('2026-09-24T00:00:00.000Z'),
      open: 100_00,
      high: 110_00,
      low: 95_00,
      close: 105_00,
      volume: 1000,
    });
  });
});

describe('ingestBhavcopy', () => {
  it('upserts each exchange’s listings and writes their candles under that exchange’s source', async () => {
    const source = {
      fetch: vi.fn(async (exchange: 'NSE' | 'BSE') => ({
        rows:
          exchange === 'BSE'
            ? [row('BSE', 'RELIANCE', '500325'), row('BSE', '7SEASL', '540874')]
            : [row('NSE', 'RELIANCE', '2885')],
        skipped: [],
      })),
    };
    const results = await ingestBhavcopy(context, log, { source, tradingDate: '2026-09-24' });

    expect(results.map((r) => `${r.exchange}:${r.status}:${r.written}`)).toEqual([
      'NSE:written:1',
      'BSE:written:2',
    ]);
    const bseCall = db.upsertListings.mock.calls.find((call) => call[1] === 'bse-bhavcopy');
    expect(bseCall?.[2]).toEqual([
      expect.objectContaining({ symbol: 'RELIANCE', exchange: 'BSE', exchangeCode: '500325' }),
      expect.objectContaining({ symbol: '7SEASL', exchange: 'BSE', exchangeCode: '540874' }),
    ]);
    expect(db.insertDailyCandles).toHaveBeenCalledWith(
      {},
      'bse-bhavcopy',
      expect.arrayContaining([expect.objectContaining({ instrumentId: 100, close: 105_00 })]),
    );
    expect(db.recordFeedIngestion).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ feed: 'bse-bhavcopy', succeeded: true, written: 2 }),
    );
  });

  it('treats a missing file as a holiday: nothing written, the other exchange unaffected', async () => {
    const source = {
      fetch: vi.fn(async (exchange: 'NSE' | 'BSE', date: string) => {
        if (exchange === 'NSE') throw new BhavcopyNotPublishedError('NSE', date, 404);
        return { rows: [row('BSE', 'RELIANCE', '500325')], skipped: [] };
      }),
    };
    const results = await ingestBhavcopy(context, log, { source, tradingDate: '2026-09-24' });
    expect(results).toEqual([
      expect.objectContaining({ exchange: 'NSE', status: 'not_published', written: 0 }),
      expect.objectContaining({ exchange: 'BSE', status: 'written', written: 1 }),
    ]);
  });

  it('refuses rows for a different date than the file claims to be for', async () => {
    const source = {
      fetch: vi.fn(async () => ({
        rows: [row('BSE', 'RELIANCE', '500325', '2026-09-23')],
        skipped: [],
      })),
    };
    const [result] = await ingestBhavcopy(context, log, {
      source,
      exchanges: ['BSE'],
      tradingDate: '2026-09-24',
    });
    expect(result).toMatchObject({ rows: 0, written: 0 });
    expect(log.warn).toHaveBeenCalledWith(
      'bhavcopy rows for another date dropped',
      expect.objectContaining({ dropped: 1 }),
    );
  });

  it('records a failed upstream against the feed and carries on', async () => {
    const source = {
      fetch: vi.fn(async (exchange: 'NSE' | 'BSE') => {
        if (exchange === 'BSE') return { rows: [row('BSE', 'RELIANCE', '500325')], skipped: [] };
        return { rows: [row('NSE', 'RELIANCE', '2885')], skipped: [] };
      }),
    };
    db.insertDailyCandles.mockRejectedValueOnce(new Error('connection reset'));
    const results = await ingestBhavcopy(context, log, { source, tradingDate: '2026-09-24' });
    expect(results.map((r) => r.exchange)).toEqual(['BSE']);
    expect(db.recordFeedIngestion).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ feed: 'nse-bhavcopy', succeeded: false }),
    );
  });
});
