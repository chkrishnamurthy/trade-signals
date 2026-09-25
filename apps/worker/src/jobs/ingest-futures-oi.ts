import { classifyOiBuildup } from '@equitywise/core';
import {
  type DerivativeOiUpsert,
  FLOW_FEEDS,
  listActiveInstruments,
  upsertDerivativeOi,
} from '@equitywise/db';
import type { FuturesOiBar, MarketDataProvider } from '@equitywise/market-data';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';
import { type IngestCount, withFeedHealth } from './ingest-disclosures.js';

/**
 * Stock-futures open interest, per session, for every F&O name.
 *
 * Reads the market-data provider's derivatives history (only Dhan has it;
 * under the router that is the `derivatives` route) and stores one row per
 * (stock, session): total OI across the listed expiries, the near contract's
 * close, and the build-up label computed in core from the change since the
 * previous session.
 *
 * Runs the MORNING AFTER a session (06:45 IST). The provider serves closed
 * bars only (hard rule 2), and — like the daily-candle pass — a session's bar
 * is treated as forming until the next IST date, so an evening run would
 * return nothing new. The page shows OI's own "as of" date, so the one-day
 * lag against the evening delivery file is visible, not hidden.
 *
 * Why total OI, not near-month only: in expiry week positions roll from the
 * near to the next contract, and near-month OI collapses while nothing has
 * actually been closed. The sum across expiries is what terminals quote as
 * "OI". The expiring contract's final-day settlement still shows as a drop on
 * expiry day itself; that is real.
 */

/**
 * Calendar days to re-fetch each run. Enough sessions to (a) compute the
 * change for the newest one and (b) heal a missed run, cheap enough to do
 * daily: 3 contracts × ~230 names × 1 request each.
 */
const WINDOW_DAYS = 12;

/**
 * Gap between stocks. The adapter already spaces one stock's contract calls;
 * this keeps the next stock's first call out of the same rolling second
 * (see `CONTRACT_PACE_MS` in the adapter). ~230 names × 3 calls at this pace
 * is about eight minutes, at 06:45 with nothing else reading.
 */
const SYMBOL_PACE_MS = 700;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface SessionOi {
  readonly tradingDate: string;
  readonly futuresOi: number;
  readonly nearExpiry: string;
  readonly futuresClosePaise: number;
  readonly contracts: number;
}

/** UTC-midnight daily-convention timestamp → its IST date key. */
function dateKeyOf(bar: FuturesOiBar): string {
  return new Date(bar.timestamp).toISOString().slice(0, 10);
}

/**
 * Folds one stock's per-contract bars into one summary per session.
 *
 * Pure; exported for tests. The near contract for a session is the one with
 * the earliest expiry on or after that session's date — the one still alive.
 */
export function summariseSessions(bars: readonly FuturesOiBar[]): SessionOi[] {
  const byDate = new Map<string, FuturesOiBar[]>();
  for (const bar of bars) {
    const key = dateKeyOf(bar);
    const list = byDate.get(key) ?? [];
    list.push(bar);
    byDate.set(key, list);
  }
  const out: SessionOi[] = [];
  for (const [tradingDate, list] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const alive = list.filter((bar) => bar.expiry >= tradingDate);
    const pool = alive.length > 0 ? alive : list;
    const near = pool.reduce((best, bar) => (bar.expiry < best.expiry ? bar : best));
    out.push({
      tradingDate,
      futuresOi: list.reduce((sum, bar) => sum + bar.openInterest, 0),
      nearExpiry: near.expiry,
      futuresClosePaise: near.close,
      contracts: list.length,
    });
  }
  return out;
}

/**
 * Rows to upsert from a stock's session summaries.
 *
 * The first session in the window has no predecessor to diff against, so it
 * is NOT written: an upsert with null deltas would overwrite the deltas a
 * previous run computed for that date when it was not the first.
 */
export function toUpsertRows(
  instrumentId: number,
  sessions: readonly SessionOi[],
  source: string,
): DerivativeOiUpsert[] {
  const rows: DerivativeOiUpsert[] = [];
  for (let i = 1; i < sessions.length; i += 1) {
    const current = sessions[i];
    const previous = sessions[i - 1];
    if (current === undefined || previous === undefined) continue;
    const oiChange = current.futuresOi - previous.futuresOi;
    const closeChangePaise = current.futuresClosePaise - previous.futuresClosePaise;
    rows.push({
      instrumentId,
      tradingDate: current.tradingDate,
      futuresOi: current.futuresOi,
      oiChange,
      nearExpiry: current.nearExpiry,
      futuresClosePaise: current.futuresClosePaise,
      closeChangePaise,
      buildup: classifyOiBuildup({ closeChange: closeChangePaise, oiChange }),
      contracts: current.contracts,
      source,
    });
  }
  return rows;
}

export interface FuturesOiResult extends IngestCount {
  readonly requested: number;
  readonly failed: readonly string[];
}

function hasDerivatives(
  provider: MarketDataProvider,
): provider is MarketDataProvider &
  Required<Pick<MarketDataProvider, 'fetchFuturesOpenInterest' | 'listDerivativeUnderlyings'>> {
  return (
    provider.capabilities.derivatives &&
    provider.fetchFuturesOpenInterest !== undefined &&
    provider.listDerivativeUnderlyings !== undefined
  );
}

export async function ingestFuturesOi(
  context: WorkerContext,
  log: Logger,
  options: { now?: Date; symbols?: readonly string[]; paceMs?: number } = {},
): Promise<FuturesOiResult> {
  const now = options.now ?? new Date();
  const { db, provider } = context;
  let requested = 0;
  const failed: string[] = [];

  const count = await withFeedHealth(context, FLOW_FEEDS.futuresOi, now, async () => {
    if (!hasDerivatives(provider)) {
      throw new Error(
        `provider ${provider.id} has no derivatives history; set MARKET_DATA_PROVIDER=dhan or routed`,
      );
    }
    const source = context.providerIdFor('derivatives');
    const universe = options.symbols ?? (await provider.listDerivativeUnderlyings());
    const active = await listActiveInstruments(db, 'equity');
    // Stock futures are NSE F&O: key only NSE listings, never a BSE row that
    // shares the symbol.
    const idBySymbol = new Map(
      active.filter((row) => row.exchange === 'NSE').map((row) => [row.symbol, row.id]),
    );
    const range = { from: new Date(now.getTime() - WINDOW_DAYS * 86_400_000), to: now };
    requested = universe.length;
    log.info('starting', { symbols: universe.length, from: range.from.toISOString() });

    let fetched = 0;
    let written = 0;
    let first = true;
    for (const symbol of universe) {
      const instrumentId = idBySymbol.get(symbol);
      if (instrumentId === undefined) {
        // In F&O but not in our instrument table: nothing to key the row on.
        failed.push(symbol);
        continue;
      }
      try {
        if (!first) await sleep(options.paceMs ?? SYMBOL_PACE_MS);
        first = false;
        const bars = await provider.fetchFuturesOpenInterest({
          ref: { symbol, kind: 'equity' },
          range,
          now,
        });
        fetched += bars.length;
        const rows = toUpsertRows(instrumentId, summariseSessions(bars), source);
        written += await upsertDerivativeOi(db, rows);
      } catch (error) {
        // One name must not cost the other two hundred.
        failed.push(symbol);
        log.warn('symbol failed', { symbol, ...errorFields(error) });
      }
    }
    log.info('finished', { requested, fetched, written, failed: failed.length });
    return { fetched, written };
  });

  return { ...count, requested, failed };
}
