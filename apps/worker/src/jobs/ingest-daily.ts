import {
  type CandleInput,
  type Database,
  ensureInstruments,
  insertDailyCandles,
  listActiveInstruments,
} from '@signal/db';
import type { InstrumentRef, MarketDataProvider } from '@signal/market-data';
import { istDateKey } from '@signal/shared';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';
import { loadUniverse } from '../universe.js';

/**
 * Daily candle ingestion.
 *
 * Runs after the session closes and pulls CLOSED daily candles for the whole
 * configured universe. This is what turns the app from "50 live history calls
 * per screener query" into "one indexed scan".
 *
 * Cost discipline: one history call per instrument, rate limited by the
 * adapter. At 5 req/s that is ~100 seconds for 500 instruments — fine for a
 * scheduled job, impossible for a page load, which is exactly why it lives here.
 */

export interface IngestResult {
  readonly requested: number;
  readonly succeeded: number;
  readonly rowsWritten: number;
  readonly failed: string[];
}

/** How far back to pull on a first run. ~2 years of sessions plus slack. */
const BACKFILL_DAYS = 800;

/** Enough to top up after a few missed sessions without refetching history. */
const INCREMENTAL_DAYS = 30;

export async function ingestDailyCandles(
  context: WorkerContext,
  log: Logger,
  options: { backfill?: boolean; now?: Date } = {},
): Promise<IngestResult> {
  const { db, provider, providerId } = context;
  const now = options.now ?? new Date();
  const days = options.backfill === true ? BACKFILL_DAYS : INCREMENTAL_DAYS;

  const universe = await loadUniverse();
  await ensureInstruments(db, providerId, universe);

  const active = await listActiveInstruments(db);
  const idBySymbol = new Map(active.map((row) => [row.symbol, row.id]));

  const range = {
    from: new Date(now.getTime() - days * 86_400_000),
    to: now,
  };

  log.info('starting', {
    instruments: universe.length,
    days,
    from: istDateKey(range.from),
    to: istDateKey(range.to),
  });

  let succeeded = 0;
  let rowsWritten = 0;
  const failed: string[] = [];

  for (const entry of universe) {
    const instrumentId = idBySymbol.get(entry.symbol);
    if (instrumentId === undefined) {
      failed.push(entry.symbol);
      continue;
    }

    try {
      const rows = await fetchDailyFor(provider, entry, range);
      const written = await insertDailyCandles(
        db,
        providerId,
        rows.map((bar) => ({ ...bar, instrumentId })),
      );
      rowsWritten += written;
      succeeded += 1;
      log.debug('ingested', { symbol: entry.symbol, fetched: rows.length, written });
    } catch (error) {
      // One dead symbol must not cost the other 499. It is recorded so a retry
      // knows exactly what to re-fetch rather than redoing the whole universe.
      failed.push(entry.symbol);
      log.warn('symbol failed', { symbol: entry.symbol, ...errorFields(error) });
    }
  }

  log.info('finished', {
    requested: universe.length,
    succeeded,
    rowsWritten,
    failed: failed.length,
  });
  return { requested: universe.length, succeeded, rowsWritten, failed };
}

async function fetchDailyFor(
  provider: MarketDataProvider,
  ref: InstrumentRef,
  range: { from: Date; to: Date },
): Promise<Omit<CandleInput, 'instrumentId'>[]> {
  // includeForming is deliberately absent, so today's unfinished session is
  // dropped. Storing a partial daily candle would let the engine read it as
  // closed — lookahead bias, and it would be permanently wrong in the table.
  const bars = await provider.fetchBars({
    ref,
    resolution: '1d',
    range,
  });

  return bars.map((bar) => ({
    ts: new Date(bar.timestamp),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

/** Re-fetches only the symbols a previous run failed on. */
export async function retryFailed(
  context: WorkerContext,
  log: Logger,
  symbols: readonly string[],
  now = new Date(),
): Promise<IngestResult> {
  if (symbols.length === 0) {
    return { requested: 0, succeeded: 0, rowsWritten: 0, failed: [] };
  }

  const { db, provider, providerId } = context;
  const wanted = new Set(symbols);
  const universe = (await loadUniverse()).filter((entry) => wanted.has(entry.symbol));
  const active = await listActiveInstruments(db);
  const idBySymbol = new Map(active.map((row) => [row.symbol, row.id]));

  const range = { from: new Date(now.getTime() - INCREMENTAL_DAYS * 86_400_000), to: now };

  let succeeded = 0;
  let rowsWritten = 0;
  const failed: string[] = [];

  for (const entry of universe) {
    const instrumentId = idBySymbol.get(entry.symbol);
    if (instrumentId === undefined) {
      failed.push(entry.symbol);
      continue;
    }
    try {
      const rows = await fetchDailyFor(provider, entry, range);
      rowsWritten += await insertDailyCandles(
        db,
        providerId,
        rows.map((bar) => ({ ...bar, instrumentId })),
      );
      succeeded += 1;
    } catch (error) {
      failed.push(entry.symbol);
      log.warn('retry failed', { symbol: entry.symbol, ...errorFields(error) });
    }
  }

  return { requested: universe.length, succeeded, rowsWritten, failed };
}

export type { Database };
