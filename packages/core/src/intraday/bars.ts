import { istDateKey, MARKET_OPEN_MINUTES, sessionOpen } from '@signal/shared';
import type { Bar } from '../types.js';

/**
 * Deriving intraday timeframes from stored 1m bars.
 *
 * Only 1m and 1d candles are ever persisted (CLAUDE.md hard rule 4); 3m, 5m,
 * 15m and 30m are built here, on read, with the bucket origin pinned to the
 * 09:15 IST open. An unaligned origin silently shifts every intraday candle in
 * the product: a 15m bucket originating at midnight UTC covers 09:00-09:15,
 * which is the pre-open auction, and every level derived from it is wrong.
 *
 * The other thing this module owns is refusing to emit an unfinished bucket.
 * A 5m bar built from two 1m bars looks exactly like a real 5m bar and is
 * lookahead bias in the most literal sense — the engine would be reading a
 * close that has not happened yet (hard rule 2).
 */

const MS_PER_MINUTE = 60_000;

export interface BucketOptions {
  /**
   * Wall clock, so "has this bucket finished" stays a testable question.
   *
   * When omitted, completeness is inferred from the last 1m bar: the minute it
   * opens is closed, so the bucket is closed if that minute reaches the
   * bucket's end. Injecting `now` is stricter and is what the live path does.
   */
  readonly now?: Date;
  /**
   * Emit the final, possibly-unfinished bucket.
   *
   * Charts may. The engine must NEVER (hard rule 2).
   */
  readonly includeForming?: boolean;
}

/** The instant a bucket containing `timestamp` opens, for an `minutes` bucket. */
export function bucketStart(timestamp: number, minutes: number): number {
  const date = new Date(timestamp);
  const open = sessionOpen(date).getTime();
  const elapsed = (timestamp - open) / MS_PER_MINUTE;
  // Math.floor rather than truncation so a pre-open bar (negative elapsed)
  // lands in the bucket below the open rather than being pulled up into it.
  return open + Math.floor(elapsed / minutes) * minutes * MS_PER_MINUTE;
}

/**
 * Aggregates 1m bars into `minutes`-minute bars, aligned to the session open.
 *
 * Open is the first minute's open, close the last minute's close, high/low the
 * extremes, volume the sum — the standard aggregation, and the same one
 * `time_bucket` performs in the database, so a bar derived here and a bar
 * derived in SQL agree.
 *
 * Gaps are preserved as gaps: a bucket with no 1m bars produces no bar rather
 * than a flat synthetic candle. A fabricated doji at a stale price reads to
 * every indicator as a real period of no movement.
 */
export function bucketBars(
  minuteBars: readonly Bar[],
  minutes: number,
  options: BucketOptions = {},
): Bar[] {
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new RangeError(`bucketBars: minutes must be a positive integer, got ${String(minutes)}`);
  }
  if (minutes === 1) {
    return options.includeForming === true ? [...minuteBars] : [...minuteBars];
  }
  if (minuteBars.length === 0) return [];

  const byBucket = new Map<
    number,
    { open: number; high: number; low: number; close: number; volume: number }
  >();
  const order: number[] = [];

  for (const bar of minuteBars) {
    const key = bucketStart(bar.timestamp, minutes);
    const existing = byBucket.get(key);
    if (existing === undefined) {
      byBucket.set(key, {
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
      order.push(key);
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    existing.volume += bar.volume;
  }

  order.sort((a, b) => a - b);
  const bars: Bar[] = order.map((timestamp) => {
    const acc = byBucket.get(timestamp);
    // Unreachable: every key in `order` was just written to `byBucket`.
    if (acc === undefined) throw new Error(`bucketBars: lost bucket ${timestamp}`);
    return { timestamp, ...acc };
  });

  if (options.includeForming === true) return bars;

  const last = bars.at(-1);
  if (last === undefined) return bars;

  const bucketEnd = last.timestamp + minutes * MS_PER_MINUTE;
  const lastMinute = minuteBars.at(-1);
  const observedThrough =
    options.now !== undefined
      ? options.now.getTime()
      : lastMinute === undefined
        ? 0
        : lastMinute.timestamp + MS_PER_MINUTE;

  return observedThrough >= bucketEnd ? bars : bars.slice(0, -1);
}

/** Bars whose IST trading date matches that of `at`. */
export function sessionBars(bars: readonly Bar[], at: Date): Bar[] {
  const key = istDateKey(at);
  return bars.filter((bar) => istDateKey(new Date(bar.timestamp)) === key);
}

/** Groups bars into consecutive sessions by IST trading date, oldest first. */
export function groupBySession(bars: readonly Bar[]): Bar[][] {
  const sessions = new Map<string, Bar[]>();
  for (const bar of bars) {
    const key = istDateKey(new Date(bar.timestamp));
    const bucket = sessions.get(key);
    if (bucket === undefined) sessions.set(key, [bar]);
    else bucket.push(bar);
  }
  return [...sessions.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, value]) => value);
}

/**
 * A bar's slot in the session, counted in minutes from the 09:15 open.
 *
 * The index into the intraday volume profile. Slot 0 is the 09:15 bar.
 */
export function sessionSlot(timestamp: number): number {
  const date = new Date(timestamp);
  const open = sessionOpen(date).getTime();
  return Math.round((timestamp - open) / MS_PER_MINUTE);
}

/** True when a bar's own OHLC is self-consistent. */
export function isCoherent(bar: Bar): boolean {
  return (
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close) &&
    bar.open > 0 &&
    bar.low > 0 &&
    bar.high >= bar.low &&
    bar.high >= bar.open &&
    bar.high >= bar.close &&
    bar.low <= bar.open &&
    bar.low <= bar.close &&
    bar.volume >= 0
  );
}

/**
 * 1m slots missing between the first and last bar of a session.
 *
 * Not every gap is a fault — an illiquid minute genuinely has no trades and
 * the exchange prints no candle. But a large count means the feed dropped
 * data, and indicators computed straight across the hole are wrong in a way
 * that looks perfectly plausible.
 */
export function countMissingMinutes(sessionMinuteBars: readonly Bar[]): number {
  const first = sessionMinuteBars[0];
  const last = sessionMinuteBars.at(-1);
  if (first === undefined || last === undefined) return 0;
  const expected = sessionSlot(last.timestamp) - sessionSlot(first.timestamp) + 1;
  return Math.max(0, expected - sessionMinuteBars.length);
}

/** Minutes elapsed between the last bar's close and `at`. */
export function stalenessMinutes(lastBar: Bar | undefined, at: Date): number {
  if (lastBar === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, (at.getTime() - (lastBar.timestamp + MS_PER_MINUTE)) / MS_PER_MINUTE);
}

/** The session's opening range, over the first `minutes` of trading. */
export function openingRange(
  sessionMinuteBars: readonly Bar[],
  minutes: number,
): { readonly high: number; readonly low: number } | null {
  const window = sessionMinuteBars.filter((bar) => {
    const slot = sessionSlot(bar.timestamp);
    return slot >= 0 && slot < minutes;
  });
  if (window.length === 0) return null;

  // Incomplete opening ranges are worse than none: a "breakout" of a range
  // that is still being built is just the price making a new high.
  const last = sessionMinuteBars.at(-1);
  if (last === undefined || sessionSlot(last.timestamp) < minutes - 1) return null;

  return {
    high: Math.max(...window.map((bar) => bar.high)),
    low: Math.min(...window.map((bar) => bar.low)),
  };
}

/** Minutes past IST midnight that intraday buckets align to. Re-exported for clarity. */
export const BUCKET_ORIGIN_MINUTES = MARKET_OPEN_MINUTES;
