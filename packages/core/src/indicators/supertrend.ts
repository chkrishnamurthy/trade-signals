import type { Bar, Series } from '../types.js';
import { wilderSmooth } from './moving-average.js';

/**
 * Supertrend (ATR period 10, multiplier 3 by default), in paise.
 *
 * The convention every charting platform uses:
 *
 *   hl2          = (high + low) ÷ 2
 *   basicUpper   = hl2 + multiplier × ATR
 *   basicLower   = hl2 − multiplier × ATR
 *   finalUpper   = basicUpper if it is BELOW the previous finalUpper, or the
 *                  previous close broke above the previous finalUpper;
 *                  otherwise the previous finalUpper (the band only ratchets down)
 *   finalLower   = basicLower if it is ABOVE the previous finalLower, or the
 *                  previous close broke below the previous finalLower;
 *                  otherwise the previous finalLower (the band only ratchets up)
 *   direction    = flips to up when close > previous finalUpper,
 *                  flips to down when close < previous finalLower,
 *                  otherwise carries the previous direction
 *   value        = finalLower while up, finalUpper while down
 *
 * ATR is Wilder-smoothed true range, as in {@link atr}.
 *
 * Warm-up: ATR first exists at index `period` (true range needs a previous
 * close), so the first value and direction appear there. The first direction is
 * seeded as UP and only becomes meaningful from the next bar — the same seed
 * TradingView uses; a test pins it.
 */
export interface SupertrendResult {
  readonly value: Series;
  /** 1 = uptrend (price above the line), −1 = downtrend, null during warm-up. */
  readonly direction: readonly (1 | -1 | null)[];
}

export function supertrend(bars: readonly Bar[], period = 10, multiplier = 3): SupertrendResult {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`supertrend: period must be a positive integer, got ${String(period)}`);
  }
  if (!(multiplier > 0)) {
    throw new RangeError(`supertrend: multiplier must be positive, got ${String(multiplier)}`);
  }

  const value: (number | null)[] = new Array(bars.length).fill(null);
  const direction: (1 | -1 | null)[] = new Array(bars.length).fill(null);
  if (bars.length < 2) return { value, direction };

  // Unrounded ATR on the bar index basis (index 0 has no true range).
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const prev = bars[i - 1];
    if (bar === undefined || prev === undefined) continue;
    trueRanges.push(
      Math.max(bar.high - bar.low, Math.abs(bar.high - prev.close), Math.abs(bar.low - prev.close)),
    );
  }
  const smoothed = wilderSmooth(trueRanges, period);

  let finalUpper = 0;
  let finalLower = 0;
  let trend: 1 | -1 = 1;
  let started = false;

  for (let i = period; i < bars.length; i += 1) {
    const bar = bars[i];
    const prev = bars[i - 1];
    const atrValue = smoothed[i - 1];
    if (bar === undefined || prev === undefined || atrValue === null || atrValue === undefined)
      continue;

    const hl2 = (bar.high + bar.low) / 2;
    const basicUpper = hl2 + multiplier * atrValue;
    const basicLower = hl2 - multiplier * atrValue;

    if (!started) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      trend = 1;
      started = true;
    } else {
      const prevUpper = finalUpper;
      const prevLower = finalLower;
      finalUpper = basicUpper < prevUpper || prev.close > prevUpper ? basicUpper : prevUpper;
      finalLower = basicLower > prevLower || prev.close < prevLower ? basicLower : prevLower;
      if (trend === -1 && bar.close > prevUpper) trend = 1;
      else if (trend === 1 && bar.close < prevLower) trend = -1;
    }

    direction[i] = trend;
    value[i] = Math.round(trend === 1 ? finalLower : finalUpper);
  }

  return { value, direction };
}
