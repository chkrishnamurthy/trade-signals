import type { Series } from '../types.js';
import { wilderSmooth } from './moving-average.js';

/**
 * Relative Strength Index (Wilder, 14 periods by default).
 *
 * Returns 0–100, a ratio rather than a price, so it stays a float.
 *
 * RSI = 100 − 100 / (1 + avgGain / avgLoss), with both averages using Wilder's
 * smoothing. When avgLoss is 0 the formula divides by zero; the conventional
 * answer is 100 (unbroken gains), which is what we return.
 */
export function rsi(closes: readonly number[], period = 14): Series {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`rsi: period must be a positive integer, got ${String(period)}`);
  }

  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i += 1) {
    const change = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // Offset by one: the first change lives at index 1, so the smoothing window
  // starts there too.
  const avgGain = wilderSmooth(gains.slice(1), period);
  const avgLoss = wilderSmooth(losses.slice(1), period);

  for (let i = 0; i < avgGain.length; i += 1) {
    const gain = avgGain[i];
    const loss = avgLoss[i];
    if (gain === null || gain === undefined || loss === null || loss === undefined) continue;
    out[i + 1] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
