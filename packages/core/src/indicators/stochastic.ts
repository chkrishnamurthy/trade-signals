import type { Bar, Series } from '../types.js';

/**
 * Stochastic oscillator (%K / %D), Lane's slow-%D convention.
 *
 *   %K[i] = (close[i] − lowest low over kPeriod) ÷ (highest high − lowest low) × 100
 *   %D[i] = simple mean of the last dPeriod %K values
 *
 * Both are dimensionless 0–100 ratios, so they stay floats.
 *
 * Warm-up:
 *   - %K first appears at index `kPeriod − 1`, when the first full window exists.
 *   - %D needs `dPeriod` real %K values, so it first appears at
 *     `kPeriod + dPeriod − 2`.
 *   - A window whose high equals its low (a flat, untraded stretch) has no
 *     defined position; %K is null there rather than an invented 50, and any
 *     %D window containing that null is null too.
 */
export interface StochasticResult {
  readonly k: Series;
  readonly d: Series;
}

export function stochastic(bars: readonly Bar[], kPeriod = 14, dPeriod = 3): StochasticResult {
  assertPeriod(kPeriod, 'kPeriod');
  assertPeriod(dPeriod, 'dPeriod');

  const k: (number | null)[] = new Array(bars.length).fill(null);
  const d: (number | null)[] = new Array(bars.length).fill(null);

  for (let i = kPeriod - 1; i < bars.length; i += 1) {
    let highest = Number.NEGATIVE_INFINITY;
    let lowest = Number.POSITIVE_INFINITY;
    for (let j = i - kPeriod + 1; j <= i; j += 1) {
      const bar = bars[j];
      if (bar === undefined) continue;
      if (bar.high > highest) highest = bar.high;
      if (bar.low < lowest) lowest = bar.low;
    }
    const close = bars[i]?.close;
    if (close === undefined || highest === lowest) continue;
    k[i] = ((close - lowest) / (highest - lowest)) * 100;
  }

  for (let i = kPeriod + dPeriod - 2; i < bars.length; i += 1) {
    let sum = 0;
    let complete = true;
    for (let j = i - dPeriod + 1; j <= i; j += 1) {
      const value = k[j];
      if (value === null || value === undefined) {
        complete = false;
        break;
      }
      sum += value;
    }
    if (complete) d[i] = sum / dPeriod;
  }

  return { k, d };
}

function assertPeriod(period: number, name: string): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`stochastic: ${name} must be a positive integer, got ${String(period)}`);
  }
}
