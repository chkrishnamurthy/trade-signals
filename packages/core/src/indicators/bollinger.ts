import type { Series } from '../types.js';

/**
 * Bollinger Bands over closes, in paise.
 *
 *   middle = SMA(period)
 *   upper  = middle + multiplier × σ
 *   lower  = middle − multiplier × σ
 *   width  = (upper − lower) ÷ middle × 100   (a percentage, so a float)
 *
 * σ is the POPULATION standard deviation of the window (divide by `period`,
 * not `period − 1`) — Bollinger's own definition and what charting platforms
 * use. The sample deviation reads ~2.6% wider at period 20 and matches nothing.
 *
 * Band prices are rounded to whole paise on output (hard rule 3); the width is
 * computed from the unrounded bands so rounding cannot move a squeeze reading.
 *
 * Warm-up: every output first appears at index `period − 1`.
 */
export interface BollingerResult {
  readonly middle: Series;
  readonly upper: Series;
  readonly lower: Series;
  /** Band width as a percentage of the middle band. */
  readonly width: Series;
}

export function bollinger(
  closes: readonly number[],
  period = 20,
  multiplier = 2,
): BollingerResult {
  if (!Number.isInteger(period) || period < 2) {
    throw new RangeError(`bollinger: period must be an integer ≥ 2, got ${String(period)}`);
  }
  if (!(multiplier > 0)) {
    throw new RangeError(`bollinger: multiplier must be positive, got ${String(multiplier)}`);
  }

  const empty = (): (number | null)[] => new Array(closes.length).fill(null);
  const middle = empty();
  const upper = empty();
  const lower = empty();
  const width = empty();

  for (let i = period - 1; i < closes.length; i += 1) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j += 1) sum += closes[j] ?? 0;
    const mean = sum / period;

    let squares = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const diff = (closes[j] ?? 0) - mean;
      squares += diff * diff;
    }
    const sigma = Math.sqrt(squares / period);
    const up = mean + multiplier * sigma;
    const down = mean - multiplier * sigma;

    middle[i] = Math.round(mean);
    upper[i] = Math.round(up);
    lower[i] = Math.round(down);
    width[i] = mean === 0 ? null : ((up - down) / mean) * 100;
  }

  return { middle, upper, lower, width };
}
