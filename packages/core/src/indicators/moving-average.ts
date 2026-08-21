import type { Series } from '../types.js';

/**
 * Moving averages.
 *
 * Hand-written rather than pulled from npm, so every value is auditable
 * (CLAUDE.md, "Do not use `technicalindicators`").
 *
 * A note on precision: these take integer paise and return integer paise, but
 * accumulate in floating point internally and round only on output. Rounding at
 * every step would make a 200-period EMA — whose smoothing factor is ~0.00995 —
 * discard small moves entirely. A float over *paise* is not the rupee-float
 * that hard rule 3 forbids; the invariant that matters is that nothing outside
 * this module ever sees a fractional price.
 */

/** Simple moving average. `null` until `period` samples exist. */
export function sma(values: readonly number[], period: number): Series {
  assertPeriod(period, 'sma');
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    if (i >= period - 1) out[i] = Math.round(sum / period);
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values.
 *
 * Seeding with an SMA rather than the first close is the convention every
 * charting platform uses; seeding with `values[0]` gives visibly different
 * numbers for the first few hundred bars.
 */
export function ema(values: readonly number[], period: number): Series {
  assertPeriod(period, 'ema');
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const k = 2 / (period + 1);

  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i] ?? 0;
  let current = seed / period;
  out[period - 1] = Math.round(current);

  for (let i = period; i < values.length; i += 1) {
    current = (values[i] ?? 0) * k + current * (1 - k);
    out[i] = Math.round(current);
  }
  return out;
}

/**
 * Wilder's smoothing (the "modified" moving average used by RSI and ATR).
 *
 * Equivalent to an EMA with k = 1/period, and deliberately distinct from
 * {@link ema} — using a standard EMA here is the single most common cause of
 * RSI values that disagree with every charting platform.
 */
export function wilderSmooth(values: readonly number[], period: number): Series {
  assertPeriod(period, 'wilderSmooth');
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i] ?? 0;
  let current = sum / period;
  out[period - 1] = current;

  for (let i = period; i < values.length; i += 1) {
    current = (current * (period - 1) + (values[i] ?? 0)) / period;
    out[i] = current;
  }
  return out;
}

function assertPeriod(period: number, label: string): void {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`${label}: period must be a positive integer, got ${String(period)}`);
  }
}
