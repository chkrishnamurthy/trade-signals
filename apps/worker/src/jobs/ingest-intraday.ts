import {
  type CandleInput,
  insertMinuteCandles,
  latestMinuteBarPerInstrument,
  listActiveInstruments,
} from '@signal/db';
import type { InstrumentRef, MarketDataProvider } from '@signal/market-data';
import { istDateKey, sessionOpen, startOfIstDay } from '@signal/shared';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';

/**
 * One-minute candle ingestion.
 *
 * The only network cost of the whole intraday feature. One history call per
 * symbol per cycle returns the session's 1m candles; every other timeframe the
 * engine uses — 3m, 5m, 15m — is derived from these in pure code (CLAUDE.md
 * hard rule 4). Fetching four timeframes separately would quadruple the bill
 * against an account-wide per-minute limit whose penalty for repeat breaches
 * is losing the rest of the trading day.
 *
 * Two rules govern what gets written:
 *
 *  - **Only closed minutes.** The provider will happily return the minute
 *    currently in progress. Writing it would put a partial candle into an
 *    append-only table (hard rule 5) where it can never be corrected, and the
 *    engine would read it as closed (hard rule 2). It is dropped here, at the
 *    boundary, rather than filtered by every consumer.
 *  - **Append-only and idempotent.** `ON CONFLICT DO NOTHING`, so re-running a
 *    cycle costs nothing and a retried run cannot double-count volume.
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * Calendar days pulled when a symbol has no recent 1m history.
 *
 * Enough to build the ten-session intraday volume profile the engine compares
 * against, plus slack for holidays and weekends.
 */
const BACKFILL_DAYS = 20;

/**
 * Symbols fetched at once.
 *
 * This does NOT raise the request rate: the adapter's rate limiter is
 * account-wide and enforces the per-second and per-minute budget whatever the
 * caller does. What it removes is idling. Fifty sequential calls at ~3 seconds
 * of upstream latency each is three minutes of mostly waiting — longer than the
 * evaluation cycle itself, so cycles would overlap and be skipped, and the feed
 * would quietly stop updating. Four in flight keeps the limiter as the only
 * thing deciding the pace.
 */
const CONCURRENCY = 4;

/** Runs `task` over `items`, at most `limit` at a time, in order. */
async function inParallel<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      await task(item);
    }
  });
  await Promise.all(workers);
}

export interface IntradayIngestResult {
  readonly requested: number;
  readonly succeeded: number;
  readonly rowsWritten: number;
  readonly failed: string[];
}

export interface IntradayIngestOptions {
  readonly now?: Date;
  /** Instruments to pull. Symbols must already exist in `instruments`. */
  readonly refs: readonly InstrumentRef[];
  /** Force a full backfill regardless of what is already stored. */
  readonly backfill?: boolean;
}

export async function ingestIntradayCandles(
  context: WorkerContext,
  log: Logger,
  options: IntradayIngestOptions,
): Promise<IntradayIngestResult> {
  const { db, provider, providerId } = context;
  const now = options.now ?? new Date();
  const { refs } = options;

  const active = await listActiveInstruments(db);
  const idBySymbol = new Map(active.map((row) => [row.symbol, row.id]));

  const wantedIds = refs
    .map((ref) => idBySymbol.get(ref.symbol))
    .filter((id): id is number => id !== undefined);

  // The incremental cursor. Without it every cycle refetches the whole
  // session, which at fifty symbols is fifty full-day requests every few
  // minutes for data we already have.
  const backfillFrom = new Date(now.getTime() - BACKFILL_DAYS * MS_PER_DAY);
  const lastStored =
    options.backfill === true
      ? new Map<number, Date>()
      : await latestMinuteBarPerInstrument(db, wantedIds, backfillFrom);

  let succeeded = 0;
  let rowsWritten = 0;
  const failed: string[] = [];

  const ingestOne = async (ref: InstrumentRef): Promise<void> => {
    const instrumentId = idBySymbol.get(ref.symbol);
    if (instrumentId === undefined) {
      failed.push(ref.symbol);
      log.warn('symbol is not a known instrument', { symbol: ref.symbol });
      return;
    }

    const cursor = lastStored.get(instrumentId);
    // Re-request from the last stored bar rather than after it: the provider's
    // range is day-granular, and overlapping is free because the insert is
    // idempotent.
    const from = cursor === undefined ? backfillFrom : startOfIstDay(cursor);

    try {
      const bars = await provider.fetchBars({
        ref,
        resolution: '1m',
        range: { from, to: now },
        now,
      });

      const closed = bars.filter((bar) => bar.timestamp + MS_PER_MINUTE <= now.getTime());
      const dropped = bars.length - closed.length;

      const rows: CandleInput[] = closed.map((bar) => ({
        instrumentId,
        ts: new Date(bar.timestamp),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));

      const written = await insertMinuteCandles(db, providerId, rows);
      rowsWritten += written;
      succeeded += 1;
      log.debug('ingested', {
        symbol: ref.symbol,
        fetched: bars.length,
        droppedForming: dropped,
        written,
      });
    } catch (error) {
      // One dead symbol must not cost the other forty-nine.
      failed.push(ref.symbol);
      log.warn('symbol failed', { symbol: ref.symbol, ...errorFields(error) });
    }
  };

  await inParallel(refs, CONCURRENCY, ingestOne);

  log.info('finished', {
    tradingDate: istDateKey(now),
    requested: refs.length,
    succeeded,
    rowsWritten,
    failed: failed.length,
  });

  return { requested: refs.length, succeeded, rowsWritten, failed };
}

/** The instant today's continuous session opened, for session-scoped reads. */
export function todaySessionOpen(now: Date): Date {
  return sessionOpen(now);
}

export type { MarketDataProvider };
