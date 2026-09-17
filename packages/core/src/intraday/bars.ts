import { istDateKey, istMinutesOfDay, sessionOpen } from '@equitywise/shared';
import type { Bar } from '../types.js';

/** Bar hygiene shared by every intraday consumer. Strategy-free. */
export const FIVE_MINUTES = 300_000;
export const SESSION_MINUTES = 375;

export function validBar(bar: Bar): boolean {
  return (
    [bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume].every(
      Number.isSafeInteger,
    ) &&
    bar.open > 0 &&
    bar.close > 0 &&
    bar.low > 0 &&
    bar.volume >= 0 &&
    bar.high >= Math.max(bar.open, bar.close) &&
    bar.low <= Math.min(bar.open, bar.close)
  );
}

/** Fail closed on malformed / duplicate / missing minutes. A partial bucket never becomes a candle. */
export function aggregateClosedMinutes(minutes: readonly Bar[], now: number): Bar[] {
  const buckets = new Map<number, Bar[]>();
  for (const bar of minutes) {
    if (!validBar(bar)) throw new RangeError('Invalid minute candle');
    const open = sessionOpen(new Date(bar.timestamp)).getTime();
    const offset = bar.timestamp - open;
    if (offset < 0 || offset >= SESSION_MINUTES * 60_000 || offset % 60_000 !== 0) continue;
    const bucket = open + Math.floor(offset / FIVE_MINUTES) * FIVE_MINUTES;
    const rows = buckets.get(bucket) ?? [];
    rows.push(bar);
    buckets.set(bucket, rows);
  }
  const result: Bar[] = [];
  for (const [timestamp, rows] of [...buckets].sort(([a], [b]) => a - b)) {
    if (timestamp + FIVE_MINUTES > now) continue;
    rows.sort((a, b) => a.timestamp - b.timestamp);
    if (rows.length !== 5 || rows.some((b, i) => b.timestamp !== timestamp + i * 60_000)) continue;
    const first = rows[0];
    const last = rows[4];
    if (!first || !last) continue;
    result.push({
      timestamp,
      open: first.open,
      close: last.close,
      high: Math.max(...rows.map((b) => b.high)),
      low: Math.min(...rows.map((b) => b.low)),
      volume: rows.reduce((s, b) => s + b.volume, 0),
    });
  }
  return result;
}

/**
 * Volume of bar `i` over the mean of the `lookback` bars before it. A zero or
 * missing baseline is `null`, never 1.0: "unavailable" must block a gate.
 */
export function relativeVolume(bars: readonly Bar[], i: number, lookback = 20): number | null {
  if (i < lookback) return null;
  const baseline = bars.slice(i - lookback, i).reduce((s, b) => s + b.volume, 0) / lookback;
  const bar = bars[i];
  return baseline > 0 && bar ? bar.volume / baseline : null;
}

/**
 * Ascending, session-aligned, contiguous, CLOSED five-minute bars. Contiguity
 * is allowed to break only from one session's 15:25 bar to the next's 09:15.
 */
export function coherentSignalBars(bars: readonly Bar[], now: number): boolean {
  return bars.every((b, i) => {
    const prev = bars[i - 1];
    if (
      !validBar(b) ||
      istMinutesOfDay(new Date(b.timestamp)) < 555 ||
      istMinutesOfDay(new Date(b.timestamp)) >= 930 ||
      b.timestamp + FIVE_MINUTES > now ||
      (b.timestamp - sessionOpen(new Date(b.timestamp)).getTime()) % FIVE_MINUTES !== 0
    )
      return false;
    if (!prev) return true;
    if (b.timestamp <= prev.timestamp) return false;
    if (istDateKey(new Date(b.timestamp)) === istDateKey(new Date(prev.timestamp)))
      return b.timestamp === prev.timestamp + FIVE_MINUTES;
    // Session boundary is allowed only from the previous close to the next open.
    return (
      istMinutesOfDay(new Date(prev.timestamp)) === 925 &&
      istMinutesOfDay(new Date(b.timestamp)) === 555
    );
  });
}

/** |close − open| / (high − low); null for a zero-range bar. */
export function bodyRatio(bar: Bar): number | null {
  const range = bar.high - bar.low;
  return range > 0 ? Math.abs(bar.close - bar.open) / range : null;
}
