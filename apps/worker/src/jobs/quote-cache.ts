import {
  type LatestQuoteInput,
  listAllWatchedInstruments,
  QUOTE_CACHE_FEED,
  recordFeedIngestion,
  upsertLatestQuotes,
} from '@equitywise/db';
import type { InstrumentRef, Quote } from '@equitywise/market-data';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';

const BATCH_SIZE = 200;

type WatchedInstrument = Awaited<ReturnType<typeof listAllWatchedInstruments>>[number];

function toRef(row: WatchedInstrument): InstrumentRef {
  return {
    symbol: row.symbol,
    exchange: row.exchange === 'BSE' ? 'BSE' : 'NSE',
    kind: row.kind === 'index' ? 'index' : 'equity',
  };
}

function toInput(
  instrument: WatchedInstrument,
  quote: Quote,
  source: string,
  fetchedAt: Date,
): LatestQuoteInput {
  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    source,
    ltpPaise: quote.ltp,
    changePaise: quote.change,
    changePercent: quote.changePercent,
    openPaise: quote.open,
    highPaise: quote.high,
    lowPaise: quote.low,
    previousClosePaise: quote.previousClose,
    averagePricePaise: quote.averagePrice,
    bidPaise: quote.bid ?? null,
    askPaise: quote.ask ?? null,
    volume: quote.volume,
    quoteAt: quote.timestamp,
    fetchedAt,
  };
}

/**
 * Refreshes latest quotes for the union of watched instruments. This is the
 * Phase-2 scaling boundary: the worker spends provider budget once per symbol,
 * while web requests read the cached snapshots from Postgres.
 */
export async function refreshLatestQuotes(
  context: WorkerContext,
  log: Logger,
): Promise<{ requested: number; fetched: number; written: number; missing: number }> {
  const startedAt = new Date();
  const watched = await listAllWatchedInstruments(context.db);
  if (watched.length === 0) {
    await recordFeedIngestion(context.db, {
      feed: QUOTE_CACHE_FEED,
      succeeded: true,
      fetched: 0,
      written: 0,
      startedAt,
      completedAt: new Date(),
    });
    log.debug('no watched instruments for quote cache');
    return { requested: 0, fetched: 0, written: 0, missing: 0 };
  }

  const bySymbol = new Map(watched.map((row) => [row.symbol, row]));
  const rows: LatestQuoteInput[] = [];
  const missing = new Set<string>();

  try {
    for (let i = 0; i < watched.length; i += BATCH_SIZE) {
      const batch = watched.slice(i, i + BATCH_SIZE);
      const fetchedAt = new Date();
      const result = await context.provider.fetchQuotes(batch.map(toRef));
      for (const symbol of result.missing) missing.add(symbol);
      for (const [symbol, quote] of result.quotes) {
        const instrument = bySymbol.get(symbol);
        if (instrument === undefined) continue;
        rows.push(toInput(instrument, quote, context.providerIdFor('quotes'), fetchedAt));
      }
    }

    const written = await upsertLatestQuotes(context.db, rows);
    await recordFeedIngestion(context.db, {
      feed: QUOTE_CACHE_FEED,
      succeeded: true,
      fetched: rows.length,
      written,
      startedAt,
      completedAt: new Date(),
    });
    if (missing.size > 0) {
      log.warn('quote cache missing symbols', {
        count: missing.size,
        symbols: [...missing].slice(0, 20),
      });
    }
    log.info('quote cache refreshed', {
      requested: watched.length,
      fetched: rows.length,
      written,
      missing: missing.size,
    });
    return { requested: watched.length, fetched: rows.length, written, missing: missing.size };
  } catch (error) {
    await recordFeedIngestion(context.db, {
      feed: QUOTE_CACHE_FEED,
      succeeded: false,
      fetched: rows.length,
      written: 0,
      error: `${errorFields(error).errorName ?? 'Error'}: ${errorFields(error).errorMessage}`,
      startedAt,
      completedAt: new Date(),
    });
    throw error;
  }
}
