import 'server-only';
import type { Bar, InstrumentRef, Resolution } from '@equitywise/market-data';
import { istDateKey, sessionClose, sessionOpen } from '@equitywise/shared';
import { getProvider } from './provider';

/**
 * Historical bars, cached hard.
 *
 * This is the expensive path: history APIs serve ONE symbol per call, so
 * indicators across a 50-stock index cost 50 requests against an account-wide
 * ceiling whose penalty for repeat breaches is a same-day ban.
 *
 * What makes it affordable: daily bars change once a day, and the engine only
 * ever consumes CLOSED bars (CLAUDE.md hard rule 2), so a snapshot stays
 * correct for the whole session. Cache by trading date and the cost collapses
 * to 50 calls per day rather than per refresh.
 */

interface CacheEntry {
  readonly bars: readonly Bar[];
  readonly validity: string;
  readonly storedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<readonly Bar[]>>();

/** Intraday caches expire on a clock; daily caches expire on the trading date. */
const INTRADAY_TTL_MS = 5 * 60_000;

export interface HistoryRequest {
  readonly ref: InstrumentRef;
  readonly resolution: Resolution;
  readonly from: Date;
  readonly to: Date;
  /**
   * Include the possibly-forming final bar. Default false.
   *
   * Charts may. The signal engine must NEVER — that is lookahead bias.
   */
  readonly includeForming?: boolean;
}

/**
 * Fetches bars, serving from cache when still valid.
 *
 * Concurrent callers for the same key share one upstream request.
 */
export async function getBars(request: HistoryRequest, now = new Date()): Promise<readonly Bar[]> {
  const { ref, resolution, from, to, includeForming = false } = request;
  const isDaily = resolution === '1d' || resolution === '1w';
  const validity = isDaily ? istDateKey(now) : String(Math.floor(now.getTime() / INTRADAY_TTL_MS));
  const cacheKey = `${ref.exchange ?? 'NSE'}:${ref.symbol}|${ref.kind}|${resolution}|${istDateKey(from)}|${istDateKey(to)}|${includeForming}`;

  const hit = cache.get(cacheKey);
  if (hit !== undefined && hit.validity === validity) return hit.bars;

  const pending = inFlight.get(cacheKey);
  if (pending !== undefined) return pending;

  const task = (async () => {
    const provider = await getProvider();
    const bars = await provider.fetchBars({
      ref,
      resolution,
      range: { from, to },
      includeForming,
      now,
    });
    cache.set(cacheKey, { bars, validity, storedAt: Date.now() });
    return bars;
  })().finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, task);
  return task;
}

/** The fixed trading-session window a 1D chart is drawn against, epoch ms. */
export interface SessionWindow {
  /** 09:15 IST. */
  readonly open: number;
  /** 15:30 IST. */
  readonly close: number;
}

/**
 * Keeps only the bars of the latest trading session present in `bars`, with
 * that session's fixed 09:15-15:30 IST window.
 *
 * The 1D chart is drawn against the whole session, not against the bars that
 * happen to exist: mid-session the line stops at "now" and the rest of the
 * plot stays empty, exactly like the exchange clock. The session is the one
 * the LAST bar falls on rather than today's date, so a weekend, a holiday or
 * the pre-open shows the last completed session instead of an empty plot. A
 * session cannot straddle IST midnight, so the IST date key identifies it.
 *
 * Returns `null` when there are no bars at all.
 */
export function latestSession(
  bars: readonly Bar[],
): { bars: readonly Bar[]; session: SessionWindow } | null {
  const last = bars.at(-1);
  if (last === undefined) return null;
  const lastInstant = new Date(last.timestamp);
  const key = istDateKey(lastInstant);
  return {
    bars: bars.filter((bar) => istDateKey(new Date(bar.timestamp)) === key),
    session: {
      open: sessionOpen(lastInstant).getTime(),
      close: sessionClose(lastInstant).getTime(),
    },
  };
}

/** Daily bars covering roughly `days` calendar days back from today. */
export function dailyRange(days: number, now = new Date()): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - days * 86_400_000), to: new Date(now) };
}

export function historyCacheStats(): { entries: number; oldestMs: number | null } {
  let oldest: number | null = null;
  for (const entry of cache.values()) {
    if (oldest === null || entry.storedAt < oldest) oldest = entry.storedAt;
  }
  return { entries: cache.size, oldestMs: oldest };
}
