import type { Bar, Series } from '../types.js';
import { wilderSmooth } from './moving-average.js';

/**
 * Average Directional Index and the Directional Indicators (Wilder, 14).
 *
 * ADX answers a question no other indicator here answers: is there a trend at
 * all? It is direction-blind — a strong downtrend and a strong uptrend both
 * read high — which is exactly why it belongs in an intraday filter. Most
 * intraday setups fail in chop, and chop is precisely "ADX below 20".
 *
 * All three outputs are 0-100 ratios, so they stay floats.
 *
 * Warm-up, which is where this indicator is usually got wrong:
 *   - True range and directional movement need a previous bar, so index 0 is
 *     undefined for everything.
 *   - +DI/-DI first appear at index `period` (Wilder smoothing over a series
 *     that itself starts at index 1).
 *   - ADX is a second Wilder smoothing, of DX, so it first appears at
 *     `2 * period - 1`. Emitting it earlier is the standard off-by-one that
 *     makes an ADX filter fire on warm-up noise every single morning.
 */

export interface AdxResult {
  /** Trend strength, 0-100. Direction-blind. */
  readonly adx: Series;
  /** Positive directional indicator, 0-100. */
  readonly plusDi: Series;
  /** Negative directional indicator, 0-100. */
  readonly minusDi: Series;
}

export function adx(bars: readonly Bar[], period = 14): AdxResult {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`adx: period must be a positive integer, got ${String(period)}`);
  }

  const empty = (): (number | null)[] => new Array(bars.length).fill(null);
  const adxOut = empty();
  const plusOut = empty();
  const minusOut = empty();

  if (bars.length < 2) return { adx: adxOut, plusDi: plusOut, minusDi: minusOut };

  // Index j of these arrays corresponds to bar j + 1.
  const trueRanges: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const prev = bars[i - 1];
    if (bar === undefined || prev === undefined) continue;

    trueRanges.push(
      Math.max(bar.high - bar.low, Math.abs(bar.high - prev.close), Math.abs(bar.low - prev.close)),
    );

    // Only the larger of the two moves counts, and only if it is outward.
    // An inside bar produces no directional movement at all in either sign.
    const upMove = bar.high - prev.high;
    const downMove = prev.low - bar.low;
    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothedTr = wilderSmooth(trueRanges, period);
  const smoothedPlus = wilderSmooth(plusDm, period);
  const smoothedMinus = wilderSmooth(minusDm, period);

  // DX lives on the same index basis as the smoothed arrays; nulls stay null
  // rather than collapsing to zero, which would let ADX start early.
  const dx: (number | null)[] = new Array(trueRanges.length).fill(null);

  for (let j = 0; j < trueRanges.length; j += 1) {
    const tr = smoothedTr[j];
    const up = smoothedPlus[j];
    const down = smoothedMinus[j];
    if (tr === null || tr === undefined || tr === 0) continue;
    if (up === null || up === undefined || down === null || down === undefined) continue;

    const plusDi = (up / tr) * 100;
    const minusDi = (down / tr) * 100;
    plusOut[j + 1] = plusDi;
    minusOut[j + 1] = minusDi;

    const sum = plusDi + minusDi;
    // Both indicators at zero means a run of pure inside bars: no directional
    // information exists, which is not the same as "trend strength is zero".
    dx[j] = sum === 0 ? null : (Math.abs(plusDi - minusDi) / sum) * 100;
  }

  // Compact before smoothing so leading nulls are not read as zeros, then map
  // back to the original indices.
  const defined: number[] = [];
  const definedIndices: number[] = [];
  for (let j = 0; j < dx.length; j += 1) {
    const value = dx[j];
    if (value === null || value === undefined) continue;
    defined.push(value);
    definedIndices.push(j);
  }

  const smoothedDx = wilderSmooth(defined, period);
  for (let k = 0; k < smoothedDx.length; k += 1) {
    const value = smoothedDx[k];
    const target = definedIndices[k];
    if (value === null || value === undefined || target === undefined) continue;
    adxOut[target + 1] = value;
  }

  return { adx: adxOut, plusDi: plusOut, minusDi: minusOut };
}
