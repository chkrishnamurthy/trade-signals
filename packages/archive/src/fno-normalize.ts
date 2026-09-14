import type { FnoCandle } from './fno-types.js';
import type { NativeRawBar } from './native-feather.js';

/**
 * Normalise raw 1-minute F&O bars (float rupees, IST-offset timestamps) into
 * clean 5-minute candles in integer paise. Pure: no I/O, no clock.
 *
 * Prices arrive as rupee floats (hard rule 3 forbids float money downstream),
 * so they are converted to integer paise here, once, at the boundary.
 */

const FIVE_MIN_MS = 5 * 60 * 1000;
const IST_OFFSET_MIN = 330; // +05:30

/** Rupees (float) → integer paise. ₹77823.50 → 7782350. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Parse "2026-08-28 09:15:00+05:30" to a UTC epoch-ms instant. */
export function parseIstTimestamp(date: string): number {
  const ms = Date.parse(date.replace(' ', 'T'));
  if (Number.isNaN(ms)) {
    throw new Error(`Unparseable timestamp: ${date}`);
  }
  return ms;
}

/** Minute-of-day in IST for a UTC instant (0..1439). 15:20 IST → 920. */
export function istMinuteOfDay(ms: number): number {
  return (Math.floor(ms / 60000) + IST_OFFSET_MIN) % 1440;
}

/**
 * Aggregate 1-minute raw bars into 5-minute candles aligned to the IST session.
 * The IST offset (330 min) is divisible by 5, so flooring the epoch to 5-minute
 * boundaries lands exactly on 09:15, 09:20, … IST. A bucket takes the first
 * open, the max high, the min low, the last close, summed volume and the last
 * OI. Empty buckets are omitted (never fabricated).
 */
export function aggregateTo5m(raw: readonly NativeRawBar[]): FnoCandle[] {
  const sorted = [...raw].sort((a, b) => parseIstTimestamp(a.date) - parseIstTimestamp(b.date));
  const buckets = new Map<number, FnoCandle>();
  const order: number[] = [];

  for (const bar of sorted) {
    const ms = parseIstTimestamp(bar.date);
    const key = Math.floor(ms / FIVE_MIN_MS) * FIVE_MIN_MS;
    const open = toPaise(bar.open);
    const high = toPaise(bar.high);
    const low = toPaise(bar.low);
    const close = toPaise(bar.close);

    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        timestamp: key,
        open,
        high,
        low,
        close,
        volume: bar.volume,
        oi: bar.oi,
      });
      order.push(key);
    } else {
      buckets.set(key, {
        timestamp: key,
        open: existing.open,
        high: Math.max(existing.high, high),
        low: Math.min(existing.low, low),
        close,
        volume: existing.volume + bar.volume,
        oi: bar.oi, // last OI in the bucket
      });
    }
  }

  return order.map((key) => {
    const candle = buckets.get(key);
    if (!candle) throw new Error('unreachable: bucket missing');
    return candle;
  });
}
