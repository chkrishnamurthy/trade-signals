import type { Series } from '../types.js';
import { ema } from './moving-average.js';

export interface MacdResult {
  /** Fast EMA − slow EMA, in paise. */
  readonly macd: Series;
  /** EMA of the MACD line, in paise. */
  readonly signal: Series;
  /** macd − signal, in paise. Positive means bullish momentum. */
  readonly histogram: Series;
}

export interface MacdConfig {
  readonly fast?: number;
  readonly slow?: number;
  readonly signal?: number;
}

/**
 * MACD (12, 26, 9 by default).
 *
 * All three outputs are price differences, so they stay in integer paise.
 *
 * The signal line is an EMA of the MACD line, which itself only exists from
 * index `slow-1` onward. We compact the defined region before smoothing and map
 * back, so the signal EMA is not polluted by leading nulls treated as zero.
 */
export function macd(closes: readonly number[], config: MacdConfig = {}): MacdResult {
  const { fast = 12, slow = 26, signal: signalPeriod = 9 } = config;
  if (fast >= slow) {
    throw new RangeError(`macd: fast (${fast}) must be shorter than slow (${slow})`);
  }

  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  const macdLine: (number | null)[] = new Array(closes.length).fill(null);
  const defined: number[] = [];
  const definedIndices: number[] = [];

  for (let i = 0; i < closes.length; i += 1) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f === null || f === undefined || s === null || s === undefined) continue;
    const value = f - s;
    macdLine[i] = value;
    defined.push(value);
    definedIndices.push(i);
  }

  const signalCompact = ema(defined, signalPeriod);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  const histogram: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = 0; i < signalCompact.length; i += 1) {
    const value = signalCompact[i];
    const target = definedIndices[i];
    if (value === null || value === undefined || target === undefined) continue;
    signalLine[target] = value;
    const line = macdLine[target];
    if (line !== null && line !== undefined) histogram[target] = line - value;
  }

  return { macd: macdLine, signal: signalLine, histogram };
}
