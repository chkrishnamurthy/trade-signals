import { istDateKey } from '@signal/shared';
import type { Bar, Series } from '../types.js';

/**
 * Volume-weighted average price, anchored to the trading session.
 *
 * The single most-referenced intraday level on an Indian equity desk: it is the
 * average price every participant actually paid today, weighted by size, so
 * "above VWAP" is shorthand for "buyers are in profit on the session".
 *
 * VWAP = Σ(typical price × volume) ÷ Σ(volume), accumulated from the session
 * open. It MUST reset at each session boundary — carrying yesterday's
 * accumulator forward produces a line that no chart shows and that no trader
 * would recognise, and by mid-morning it is wrong by a full day of volume.
 *
 * Typical price is (high + low + close) / 3, rounded to whole paise so nothing
 * fractional escapes (CLAUDE.md hard rule 3). The accumulator itself runs in
 * floating point over paise for the same reason the moving averages do: a
 * running sum re-rounded every bar drifts, and the invariant that matters is
 * that no caller sees a fractional price.
 */

/** (high + low + close) / 3, in paise. */
export function typicalPrice(bar: Bar): number {
  return Math.round((bar.high + bar.low + bar.close) / 3);
}

/**
 * Session-anchored VWAP, aligned to `bars`.
 *
 * Resets whenever the IST calendar date changes, so a multi-session series
 * yields one independent VWAP per session rather than one running average.
 *
 * A bar with zero volume contributes nothing but does not break the line: the
 * accumulator is unchanged and the previous value carries. The first bar of a
 * session with zero volume has no volume-weighted price at all, so it is
 * `null` rather than a bare close masquerading as a VWAP.
 */
export function vwap(bars: readonly Bar[]): Series {
  const out: (number | null)[] = new Array(bars.length).fill(null);

  let sessionKey: string | null = null;
  let priceVolume = 0;
  let volume = 0;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar === undefined) continue;

    const key = istDateKey(new Date(bar.timestamp));
    if (key !== sessionKey) {
      sessionKey = key;
      priceVolume = 0;
      volume = 0;
    }

    priceVolume += typicalPrice(bar) * bar.volume;
    volume += bar.volume;
    out[i] = volume === 0 ? null : Math.round(priceVolume / volume);
  }

  return out;
}

/**
 * VWAP slope over `lookback` bars, as a percentage of the current VWAP.
 *
 * A ratio, not a price, so it stays a float. Positive means VWAP is rising —
 * the session's average transaction price is climbing, which is what separates
 * "price is above a flat VWAP" (chop) from "price is above a rising VWAP"
 * (trend). Null when either endpoint has not warmed up.
 */
export function vwapSlopePercent(series: Series, lookback: number): number | null {
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new RangeError(`vwapSlopePercent: lookback must be a positive integer, got ${lookback}`);
  }
  const now = series.at(-1);
  const then = series.at(-1 - lookback);
  if (now === null || now === undefined || then === null || then === undefined || then === 0) {
    return null;
  }
  return ((now - then) / then) * 100;
}
