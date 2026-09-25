import { type CandleInput, insertDailyCandles, upsertListings } from '@equitywise/db';
import { type Exchange, istDateKey } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';
import {
  BhavcopyNotPublishedError,
  type BhavcopyRow,
  type BhavcopySource,
  createBhavcopySource,
} from '../sources/bhavcopy.js';
import { withFeedHealth } from './ingest-disclosures.js';

/**
 * End-of-day candles for EVERY listed equity, from the exchanges' bhavcopies.
 *
 * `ingest-daily` asks a broker for one history call per name, which is why it
 * covers only the configured universe. The bhavcopy covers the whole market —
 * ~2,300 NSE and ~3,900 BSE main-board equities — in one download per exchange
 * per session, without spending the brokers' shared request budgets
 * (multi-exchange plan §2.4). It is what makes a BSE-only small cap
 * screenable at all.
 *
 * For each exchange:
 *   1. upsert the listing rows (ISIN, scrip code, series) — metadata only;
 *   2. insert one closed daily candle per listing, stamped at UTC midnight of
 *      the trading date, the convention every stored daily candle follows.
 *
 * Append-only: a candle already written (by this job or by `ingest-daily`) is
 * left alone (hard rule 5). A missing file is a holiday or a late publish,
 * recorded and not written, never guessed.
 */

export const BHAVCOPY_EXCHANGES: readonly Exchange[] = ['NSE', 'BSE'];

/** The source id stored on rows this job writes, per exchange. */
export function bhavcopyProviderId(exchange: Exchange): string {
  return `${exchange.toLowerCase()}-bhavcopy`;
}

export interface BhavcopyIngestResult {
  readonly exchange: Exchange;
  readonly tradingDate: string;
  readonly status: 'written' | 'not_published';
  readonly rows: number;
  readonly written: number;
  readonly skipped: number;
}

export interface BhavcopyOptions {
  readonly exchanges?: readonly Exchange[];
  /** `YYYY-MM-DD`; defaults to today in IST. */
  readonly tradingDate?: string;
  readonly source?: BhavcopySource;
  readonly now?: Date;
}

/** UTC midnight of an IST trading date — the stored daily-candle timestamp. */
export function dailyCandleTs(tradingDate: string): Date {
  return new Date(`${tradingDate}T00:00:00.000Z`);
}

/** Pure: a parsed row to a candle for a known instrument. */
export function toCandle(row: BhavcopyRow, instrumentId: number): CandleInput {
  return {
    instrumentId,
    ts: dailyCandleTs(row.tradingDate),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  };
}

export async function ingestBhavcopy(
  context: WorkerContext,
  log: Logger,
  options: BhavcopyOptions = {},
): Promise<BhavcopyIngestResult[]> {
  const now = options.now ?? new Date();
  const tradingDate = options.tradingDate ?? istDateKey(now);
  const source = options.source ?? createBhavcopySource();
  const results: BhavcopyIngestResult[] = [];

  for (const exchange of options.exchanges ?? BHAVCOPY_EXCHANGES) {
    try {
      results.push(await ingestOne(context, log, source, exchange, tradingDate, now));
    } catch (error) {
      // One exchange's failure must not cost the other its session.
      log.warn('bhavcopy failed', { exchange, tradingDate, ...errorFields(error) });
    }
  }
  return results;
}

async function ingestOne(
  context: WorkerContext,
  log: Logger,
  source: BhavcopySource,
  exchange: Exchange,
  tradingDate: string,
  now: Date,
): Promise<BhavcopyIngestResult> {
  let parsed: Awaited<ReturnType<BhavcopySource['fetch']>>;
  try {
    parsed = await source.fetch(exchange, tradingDate);
  } catch (error) {
    if (error instanceof BhavcopyNotPublishedError) {
      log.info('bhavcopy not published', { exchange, tradingDate });
      return { exchange, tradingDate, status: 'not_published', rows: 0, written: 0, skipped: 0 };
    }
    throw error;
  }
  // A file for another date is the exchange serving yesterday's copy under
  // today's name; storing it would stamp a stale session with today's date.
  const rows = parsed.rows.filter((row) => row.tradingDate === tradingDate);
  if (rows.length < parsed.rows.length) {
    log.warn('bhavcopy rows for another date dropped', {
      exchange,
      tradingDate,
      dropped: parsed.rows.length - rows.length,
    });
  }
  if (parsed.skipped.length > 0) {
    log.warn('bhavcopy rows skipped', {
      exchange,
      tradingDate,
      count: parsed.skipped.length,
      sample: parsed.skipped.slice(0, 5),
    });
  }

  const providerId = bhavcopyProviderId(exchange);
  let written = 0;
  await withFeedHealth(context, providerId, now, async () => {
    const ids = await upsertListings(
      context.db,
      providerId,
      rows.map((row) => ({
        symbol: row.symbol,
        name: row.name,
        exchange,
        isin: row.isin,
        exchangeCode: row.exchangeCode,
        series: row.series,
      })),
    );
    const candles: CandleInput[] = [];
    for (const row of rows) {
      const id = ids.get(row.exchangeCode);
      if (id !== undefined) candles.push(toCandle(row, id));
    }
    written = await insertDailyCandles(context.db, providerId, candles);
    return { fetched: rows.length, written };
  });

  log.info('bhavcopy ingested', { exchange, tradingDate, rows: rows.length, written });
  return {
    exchange,
    tradingDate,
    status: 'written',
    rows: rows.length,
    written,
    skipped: parsed.skipped.length,
  };
}

/**
 * Walks the last `days` calendar days oldest first, one file per exchange per
 * weekday — enough history (~430 days ≈ 300 sessions) for a 200-day EMA and a
 * 52-week range on every listing, at no broker cost. Idempotent: a re-run
 * only fills gaps.
 */
export async function backfillBhavcopy(
  context: WorkerContext,
  log: Logger,
  options: BhavcopyOptions & { days?: number } = {},
): Promise<{ sessions: number; written: number; notPublished: readonly string[] }> {
  const now = options.now ?? new Date();
  const days = options.days ?? 430;
  const source = options.source ?? createBhavcopySource();
  let sessions = 0;
  let written = 0;
  const notPublished: string[] = [];

  for (let back = days; back >= 1; back -= 1) {
    const day = new Date(now.getTime() - back * 86_400_000);
    const weekday = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(day);
    if (weekday === 'Sat' || weekday === 'Sun') continue;
    const tradingDate = istDateKey(day);

    const results = await ingestBhavcopy(context, log, { ...options, source, tradingDate, now });
    for (const result of results) {
      if (result.status === 'not_published') notPublished.push(`${result.exchange}:${tradingDate}`);
      written += result.written;
    }
    if (results.some((r) => r.status === 'written')) sessions += 1;
    // Polite to the exchanges' archives: one day's files at a time.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  log.info('bhavcopy backfill finished', { sessions, written, notPublished: notPublished.length });
  return { sessions, written, notPublished };
}
