import 'server-only';
import type { Bar } from '@signal/core';
import { type Candle, type FyersResolution, fetchCandles } from '@signal/fyers';
import { istDateKey } from '@signal/shared';
import { getFyersFetcher } from './fyers-client';

/**
 * Historical candles, cached hard.
 *
 * This is the expensive path. `/data/history` takes ONE symbol per request, so
 * indicators across a 50-stock index cost 50 calls — against a 200/minute
 * account-wide ceiling whose penalty for repeat breaches is a same-day ban.
 *
 * What makes it affordable: daily candles only change once a day, and the
 * engine only ever consumes CLOSED candles (CLAUDE.md hard rule 2), so a
 * snapshot stays correct for the whole session. Cache by trading date and the
 * cost collapses to 50 calls per day rather than per refresh.
 */

interface CacheEntry {
  readonly bars: Bar[];
  readonly key: string;
  readonly storedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Bar[]>>();

/** Intraday caches expire on a clock; daily caches expire on the trading date. */
const INTRADAY_TTL_MS = 5 * 60_000;

/** Candles → the pure engine's Bar shape. Prices are already integer paise. */
function toBars(candles: readonly Candle[]): Bar[] {
  return candles.map((c) => ({
    timestamp: c.timestamp.getTime(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

/**
 * Drops the final candle when it may still be forming.
 *
 * The engine must never see a partial bar — that is lookahead bias, and it
 * silently corrupts every backtest built on the same code path.
 */
function dropFormingCandle(bars: Bar[], resolution: FyersResolution, now: Date): Bar[] {
  const last = bars.at(-1);
  if (last === undefined) return bars;

  if (resolution === 'D' || resolution === '1D') {
    // A daily candle for today is still forming until the session closes.
    return istDateKey(new Date(last.timestamp)) === istDateKey(now) ? bars.slice(0, -1) : bars;
  }
  return bars;
}

export interface HistoryRequest {
  readonly fyersSymbol: string;
  readonly resolution: FyersResolution;
  readonly from: Date;
  readonly to: Date;
  /** Omit the possibly-forming final candle. Default true. */
  readonly closedOnly?: boolean;
}

/**
 * Fetches candles, serving from cache when still valid.
 *
 * Concurrent callers for the same symbol share one upstream request.
 */
export async function getBars(request: HistoryRequest, now = new Date()): Promise<Bar[]> {
  const { fyersSymbol, resolution, from, to, closedOnly = true } = request;
  const isDaily = resolution === 'D' || resolution === '1D';
  // Daily data is keyed by trading date; intraday by a rolling clock bucket.
  const validity = isDaily ? istDateKey(now) : String(Math.floor(now.getTime() / INTRADAY_TTL_MS));
  const cacheKey = `${fyersSymbol}|${resolution}|${istDateKey(from)}|${istDateKey(to)}`;

  const hit = cache.get(cacheKey);
  if (hit !== undefined && hit.key === validity) return hit.bars;

  const pending = inFlight.get(cacheKey);
  if (pending !== undefined) return pending;

  const task = (async () => {
    const fetcher = getFyersFetcher();
    const candles = await fetchCandles(fetcher, fyersSymbol, resolution, { from, to });
    let bars = toBars(candles);
    if (closedOnly) bars = dropFormingCandle(bars, resolution, now);
    cache.set(cacheKey, { bars, key: validity, storedAt: Date.now() });
    return bars;
  })().finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, task);
  return task;
}

/** Daily bars covering roughly `days` calendar days back from today. */
export function dailyRange(days: number, now = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now.getTime() - days * 86_400_000);
  return { from, to };
}

export function historyCacheStats(): { entries: number; oldestMs: number | null } {
  let oldest: number | null = null;
  for (const entry of cache.values()) {
    if (oldest === null || entry.storedAt < oldest) oldest = entry.storedAt;
  }
  return { entries: cache.size, oldestMs: oldest };
}
