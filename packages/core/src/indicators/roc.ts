import type { Series } from '../types.js';

/**
 * Rate of change, as a percentage.
 *
 * `(value[i] - value[i - period]) / value[i - period] × 100`. A ratio, not a
 * price, so it stays a float.
 *
 * Used here as the raw momentum reading behind "is this move accelerating?" —
 * comparing ROC over a short window against ROC over a longer one separates a
 * fresh impulse from the tail of one that is already spent.
 *
 * First non-null value lands at index `period`: index 0 has nothing `period`
 * bars behind it.
 */
export function roc(values: readonly number[], period: number): Series {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`roc: period must be a positive integer, got ${String(period)}`);
  }

  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period; i < values.length; i += 1) {
    const now = values[i];
    const then = values[i - period];
    if (now === undefined || then === undefined || then === 0) continue;
    out[i] = ((now - then) / then) * 100;
  }
  return out;
}
