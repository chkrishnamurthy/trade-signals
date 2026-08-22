import type { Bar } from '../types.js';

/**
 * Price structure: swings, trend structure, consolidation and expansion.
 *
 * Everything here reads price alone — no indicator, no volume. That
 * independence is the point: a structural read and an oscillator read
 * agreeing is confluence, whereas two oscillators agreeing is mostly the same
 * information counted twice.
 */

export interface SwingPoint {
  readonly index: number;
  readonly timestamp: number;
  /** Paise. */
  readonly price: number;
  readonly kind: 'high' | 'low';
}

/**
 * Fractal swing points: a bar whose extreme exceeds `lookback` bars on BOTH
 * sides.
 *
 * The right-hand requirement is what makes a swing a swing rather than "the
 * highest bar so far", and it means a pivot is only knowable `lookback` bars
 * after it printed. That delay is honest — it is exactly how long the market
 * takes to confirm the turn — and it is not lookahead: the pivot at index `i`
 * is only reported once bars through `i + lookback` have closed.
 */
export function findSwings(bars: readonly Bar[], lookback: number): SwingPoint[] {
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new RangeError(`findSwings: lookback must be a positive integer, got ${lookback}`);
  }

  const swings: SwingPoint[] = [];
  for (let i = lookback; i < bars.length - lookback; i += 1) {
    const bar = bars[i];
    if (bar === undefined) continue;

    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j += 1) {
      if (j === i) continue;
      const other = bars[j];
      if (other === undefined) continue;
      if (other.high >= bar.high) isHigh = false;
      if (other.low <= bar.low) isLow = false;
    }

    if (isHigh) swings.push({ index: i, timestamp: bar.timestamp, price: bar.high, kind: 'high' });
    if (isLow) swings.push({ index: i, timestamp: bar.timestamp, price: bar.low, kind: 'low' });
  }
  return swings;
}

export type StructureKind =
  | 'higher_highs_higher_lows'
  | 'lower_highs_lower_lows'
  | 'higher_lows_only'
  | 'lower_highs_only'
  | 'range'
  | 'indeterminate';

export interface StructureRead {
  readonly kind: StructureKind;
  /** +1 bullish structure, −1 bearish, 0 neither. */
  readonly bias: number;
  readonly detail: string;
  readonly lastSwingHigh: SwingPoint | null;
  readonly priorSwingHigh: SwingPoint | null;
  readonly lastSwingLow: SwingPoint | null;
  readonly priorSwingLow: SwingPoint | null;
}

/**
 * Classifies structure from the last two swings on each side.
 *
 * Two of each is the minimum that can express a direction; one of each only
 * says where price has been. When either side is missing, the answer is
 * `indeterminate` — not `range`, which is a positive claim that price is
 * oscillating rather than an admission of not knowing.
 */
export function readStructure(bars: readonly Bar[], lookback: number): StructureRead {
  const swings = findSwings(bars, lookback);
  const highs = swings.filter((s) => s.kind === 'high');
  const lows = swings.filter((s) => s.kind === 'low');

  const lastHigh = highs.at(-1) ?? null;
  const priorHigh = highs.at(-2) ?? null;
  const lastLow = lows.at(-1) ?? null;
  const priorLow = lows.at(-2) ?? null;

  const base = {
    lastSwingHigh: lastHigh,
    priorSwingHigh: priorHigh,
    lastSwingLow: lastLow,
    priorSwingLow: priorLow,
  };

  if (lastHigh === null || priorHigh === null || lastLow === null || priorLow === null) {
    return {
      kind: 'indeterminate',
      bias: 0,
      detail: 'Not enough confirmed swing points to read structure',
      ...base,
    };
  }

  const higherHigh = lastHigh.price > priorHigh.price;
  const higherLow = lastLow.price > priorLow.price;

  if (higherHigh && higherLow) {
    return {
      kind: 'higher_highs_higher_lows',
      bias: 1,
      detail: 'Higher highs and higher lows',
      ...base,
    };
  }
  if (!higherHigh && !higherLow) {
    return {
      kind: 'lower_highs_lower_lows',
      bias: -1,
      detail: 'Lower highs and lower lows',
      ...base,
    };
  }
  if (higherLow) {
    return {
      kind: 'higher_lows_only',
      bias: 0.5,
      detail: 'Higher lows into a flat high — pressure building upward',
      ...base,
    };
  }
  return {
    kind: 'lower_highs_only',
    bias: -0.5,
    detail: 'Lower highs into a flat low — pressure building downward',
    ...base,
  };
}

export interface RangeRead {
  /** Highest high over the window, paise. */
  readonly high: number;
  /** Lowest low over the window, paise. */
  readonly low: number;
  /** high − low, paise. */
  readonly width: number;
  /** Range width ÷ ATR. Below ~2 is a genuinely tight coil. */
  readonly widthInAtr: number | null;
  readonly consolidating: boolean;
  /** Last bar's range ÷ ATR. Above ~1.5 is an expansion bar. */
  readonly lastBarInAtr: number | null;
  readonly expanding: boolean;
}

/**
 * The recent range, and whether price is coiling or expanding out of it.
 *
 * Both readings are expressed in ATR multiples rather than paise so they mean
 * the same thing on a ₹200 stock and a ₹4,000 one.
 */
export function readRange(
  bars: readonly Bar[],
  lookback: number,
  atr: number | null,
): RangeRead | null {
  const window = bars.slice(-lookback);
  if (window.length === 0) return null;

  const high = Math.max(...window.map((bar) => bar.high));
  const low = Math.min(...window.map((bar) => bar.low));
  const width = high - low;
  const last = bars.at(-1);

  const widthInAtr = atr === null || atr === 0 ? null : width / atr;
  const lastBarInAtr =
    last === undefined || atr === null || atr === 0 ? null : (last.high - last.low) / atr;

  return {
    high,
    low,
    width,
    widthInAtr,
    consolidating: widthInAtr !== null && widthInAtr < 2.5,
    lastBarInAtr,
    expanding: lastBarInAtr !== null && lastBarInAtr > 1.5,
  };
}

/**
 * The range price broke out OF, excluding the breakout bar itself.
 *
 * Measuring the range with the breakout bar included guarantees the close sits
 * inside it, so nothing ever registers as a break. The window therefore ends
 * one bar early — which is also the honest definition: the level was formed
 * before it was broken.
 */
export function priorRange(
  bars: readonly Bar[],
  lookback: number,
): { readonly high: number; readonly low: number } | null {
  const window = bars.slice(-lookback - 1, -1);
  if (window.length === 0) return null;
  return {
    high: Math.max(...window.map((bar) => bar.high)),
    low: Math.min(...window.map((bar) => bar.low)),
  };
}

/** Signed gap between the session open and the previous close, in percent. */
export function gapPercent(dayOpen: number | null, previousClose: number | null): number | null {
  if (dayOpen === null || previousClose === null || previousClose === 0) return null;
  return ((dayOpen - previousClose) / previousClose) * 100;
}
