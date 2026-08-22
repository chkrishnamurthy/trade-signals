import type { Bar } from '../types.js';
import type { SwingPoint } from './structure.js';
import type { PriceLevel } from './types.js';

/**
 * Intraday support and resistance.
 *
 * Levels are ranked by `significance` rather than treated as equal, because
 * they are not: the previous day's high is watched by everyone with a chart
 * open, a swing high from twenty minutes ago is watched by far fewer, and a
 * break of the two means different things. Significance is what stops a
 * breakout of a trivial level scoring like a breakout of a real one.
 *
 * All prices are integer paise. Nothing here reads a clock.
 */

export interface LevelInputs {
  readonly previousClose: number | null;
  readonly previousHigh: number | null;
  readonly previousLow: number | null;
  readonly dayOpen: number | null;
  readonly dayHigh: number | null;
  readonly dayLow: number | null;
  readonly openingRangeHigh: number | null;
  readonly openingRangeLow: number | null;
  readonly vwap: number | null;
  readonly swings: readonly SwingPoint[];
  /** Current price, used to classify each level as support or resistance. */
  readonly price: number;
}

/**
 * Builds the session's level map.
 *
 * A level is `resistance` when it sits above the current price and `support`
 * when below — the same price is both, at different times of day, and
 * hard-coding one would make a reclaimed level keep reading as resistance.
 * VWAP and the previous close are `pivot`: they are reference lines whose
 * meaning is "which side of this are we on", not barriers.
 */
export function buildLevels(inputs: LevelInputs): PriceLevel[] {
  const levels: PriceLevel[] = [];
  const { price } = inputs;

  const side = (value: number): 'support' | 'resistance' =>
    value <= price ? 'support' : 'resistance';

  const add = (
    key: string,
    label: string,
    value: number | null,
    significance: number,
    kind?: 'support' | 'resistance' | 'pivot',
  ): void => {
    if (value === null || !Number.isFinite(value) || value <= 0) return;
    levels.push({ key, label, price: value, significance, kind: kind ?? side(value) });
  };

  // Yesterday's extremes are the most-watched intraday levels there are.
  add('previousHigh', 'Previous day high', inputs.previousHigh, 0.95);
  add('previousLow', 'Previous day low', inputs.previousLow, 0.95);
  add('previousClose', 'Previous close', inputs.previousClose, 0.85, 'pivot');
  add('vwap', 'VWAP', inputs.vwap, 0.85, 'pivot');
  add('openingRangeHigh', 'Opening range high', inputs.openingRangeHigh, 0.8);
  add('openingRangeLow', 'Opening range low', inputs.openingRangeLow, 0.8);
  add('dayHigh', 'Day high', inputs.dayHigh, 0.7);
  add('dayLow', 'Day low', inputs.dayLow, 0.7);
  add('dayOpen', 'Day open', inputs.dayOpen, 0.6, 'pivot');

  // Only the most recent swings: an intraday pivot from three hours ago has
  // been traded through several times and no longer describes live interest.
  //
  // Keyed by PRICE, not by bar index. A level's key becomes the identity of any
  // setup anchored to it, and a bar index shifts by one every time a new bar
  // prints — which would make the same swing high look like a brand-new level
  // on every evaluation, expiring the signal built on it and immediately
  // creating a duplicate.
  const recentHighs = inputs.swings.filter((s) => s.kind === 'high').slice(-3);
  const recentLows = inputs.swings.filter((s) => s.kind === 'low').slice(-3);
  recentHighs.forEach((swing, offset) => {
    add(`swingHigh:${swing.price}`, 'Recent swing high', swing.price, 0.5 + offset * 0.05);
  });
  recentLows.forEach((swing, offset) => {
    add(`swingLow:${swing.price}`, 'Recent swing low', swing.price, 0.5 + offset * 0.05);
  });

  return levels.sort((a, b) => b.price - a.price);
}

/** The most significant level above `price`, or null if there is none. */
export function nearestResistance(levels: readonly PriceLevel[], price: number): PriceLevel | null {
  const above = levels.filter((level) => level.price > price);
  if (above.length === 0) return null;
  // Nearest first, then most significant among equally near ones.
  return above.sort((a, b) => a.price - b.price || b.significance - a.significance)[0] ?? null;
}

/** The most significant level below `price`, or null if there is none. */
export function nearestSupport(levels: readonly PriceLevel[], price: number): PriceLevel | null {
  const below = levels.filter((level) => level.price < price);
  if (below.length === 0) return null;
  return below.sort((a, b) => b.price - a.price || b.significance - a.significance)[0] ?? null;
}

/**
 * The most significant level price has just closed decisively above.
 *
 * "Decisively" is a buffer expressed in ATR, not paise: a close one tick above
 * a level is indistinguishable from noise, and a fixed rupee buffer means
 * something different on every stock.
 */
export function brokenAbove(
  levels: readonly PriceLevel[],
  close: number,
  previousClose: number,
  buffer: number,
): PriceLevel | null {
  const broken = levels.filter(
    (level) => previousClose <= level.price && close > level.price + buffer,
  );
  if (broken.length === 0) return null;
  return broken.sort((a, b) => b.significance - a.significance || b.price - a.price)[0] ?? null;
}

/** The mirror: the most significant level price has closed decisively below. */
export function brokenBelow(
  levels: readonly PriceLevel[],
  close: number,
  previousClose: number,
  buffer: number,
): PriceLevel | null {
  const broken = levels.filter(
    (level) => previousClose >= level.price && close < level.price - buffer,
  );
  if (broken.length === 0) return null;
  return broken.sort((a, b) => b.significance - a.significance || a.price - b.price)[0] ?? null;
}

/** True when `price` sits within `tolerance` paise of a level. */
export function isAtLevel(level: PriceLevel, price: number, tolerance: number): boolean {
  return Math.abs(price - level.price) <= tolerance;
}

export interface BreakHistory {
  /** Bars since the level was first closed through, or null if never. */
  readonly barsSinceBreak: number | null;
  /** True when price broke the level and then closed back inside it. */
  readonly failed: boolean;
  /** True when price broke, pulled back to the level, and held it. */
  readonly retested: boolean;
}

/**
 * How a level has behaved over the recent bars.
 *
 * This is what separates the three outcomes a break can have. A fresh break is
 * a breakout; a break that closed back inside is a failed one and is bearish
 * for a long; a break followed by a pullback that held is the highest-quality
 * version of all three, because the level has now been tested from the other
 * side.
 */
export function trackBreak(
  bars: readonly Bar[],
  level: number,
  direction: 'above' | 'below',
  lookback: number,
  tolerance: number,
): BreakHistory {
  const window = bars.slice(-lookback);
  const broke = (bar: Bar): boolean =>
    direction === 'above' ? bar.close > level : bar.close < level;

  let firstBreakIndex: number | null = null;
  for (let i = 0; i < window.length; i += 1) {
    const bar = window[i];
    if (bar === undefined) continue;
    if (broke(bar)) {
      firstBreakIndex = i;
      break;
    }
  }

  if (firstBreakIndex === null) {
    return { barsSinceBreak: null, failed: false, retested: false };
  }

  const after = window.slice(firstBreakIndex + 1);
  const last = window.at(-1);
  const failed = last !== undefined && !broke(last) && after.length > 0;

  // A retest is a bar that traded back into the level's tolerance band and
  // still closed on the breakout side.
  const retested = after.some((bar) => {
    const touched =
      direction === 'above'
        ? bar.low <= level + tolerance && bar.low >= level - tolerance * 2
        : bar.high >= level - tolerance && bar.high <= level + tolerance * 2;
    return touched && broke(bar);
  });

  return { barsSinceBreak: window.length - 1 - firstBreakIndex, failed, retested };
}
