import type { Bar } from '../types.js';
import type { TradeDirection } from './types.js';

/**
 * Candlestick and bar patterns.
 *
 * A pattern here is EVIDENCE, never a signal. Candlestick patterns in
 * isolation have famously weak and inconsistent published edge; what they do
 * carry is information about who won the last bar, which is worth something
 * when it agrees with trend, level and volume. So every function returns a
 * strength, the scoring model gives patterns a minority share of one category,
 * and nothing here can trigger anything on its own.
 *
 * Every threshold is expressed against the bar's own range or against ATR, so
 * a pattern means the same thing on a ₹200 stock and a ₹4,000 one.
 */

export interface PatternMatch {
  readonly key: string;
  readonly label: string;
  /** Which side the pattern favours. */
  readonly direction: TradeDirection;
  /** 0-1. How cleanly the bar meets the definition. */
  readonly strength: number;
  readonly detail: string;
}

const body = (bar: Bar): number => Math.abs(bar.close - bar.open);
const range = (bar: Bar): number => bar.high - bar.low;
const upperWick = (bar: Bar): number => bar.high - Math.max(bar.open, bar.close);
const lowerWick = (bar: Bar): number => Math.min(bar.open, bar.close) - bar.low;
const isUp = (bar: Bar): boolean => bar.close > bar.open;

/** Body as a fraction of the bar's total range. 0 for a zero-range bar. */
export function bodyRatio(bar: Bar): number {
  const total = range(bar);
  return total === 0 ? 0 : body(bar) / total;
}

/**
 * Every pattern present on the last closed bar.
 *
 * Ordered by the number of bars each definition consumes, so a three-bar
 * reversal is reported alongside — not instead of — the one-bar rejection that
 * completes it.
 */
export function detectPatterns(bars: readonly Bar[], atr: number | null): PatternMatch[] {
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const prior = bars.at(-3);
  if (last === undefined) return [];

  const matches: PatternMatch[] = [];
  const push = (match: PatternMatch | null): void => {
    if (match !== null) matches.push(match);
  };

  push(momentumCandle(last, atr));
  push(doji(last));
  push(hammer(last));
  push(shootingStar(last));
  if (prev !== undefined) {
    push(engulfing(prev, last));
    push(insideBar(prev, last));
  }
  if (prev !== undefined && prior !== undefined) {
    push(star(prior, prev, last));
  }

  return matches;
}

/** A wide-range bar closing near its extreme: one side took the whole bar. */
export function momentumCandle(bar: Bar, atr: number | null): PatternMatch | null {
  const ratio = bodyRatio(bar);
  if (ratio < 0.65) return null;
  if (atr !== null && atr > 0 && range(bar) < atr * 0.9) return null;

  const direction: TradeDirection = isUp(bar) ? 'long' : 'short';
  const inAtr = atr === null || atr === 0 ? null : range(bar) / atr;
  return {
    key: 'momentumCandle',
    label: isUp(bar) ? 'Bullish momentum candle' : 'Bearish momentum candle',
    direction,
    strength: Math.min(1, (ratio - 0.65) / 0.3 + (inAtr === null ? 0 : Math.min(0.4, inAtr / 5))),
    detail:
      inAtr === null
        ? `Body is ${(ratio * 100).toFixed(0)}% of the bar`
        : `Body is ${(ratio * 100).toFixed(0)}% of a ${inAtr.toFixed(1)}× ATR bar`,
  };
}

/**
 * Indecision: a body that is almost nothing against the bar's range.
 *
 * Direction-neutral by nature, so it is reported as `long` with near-zero
 * strength only when it is doing something useful — appearing after a run,
 * where it marks a stall. On its own it contributes essentially nothing.
 */
export function doji(bar: Bar): PatternMatch | null {
  const ratio = bodyRatio(bar);
  if (ratio > 0.1 || range(bar) === 0) return null;
  return {
    key: 'doji',
    label: 'Doji — indecision',
    direction: isUp(bar) ? 'long' : 'short',
    strength: 0.15,
    detail: `Body is only ${(ratio * 100).toFixed(1)}% of the bar's range`,
  };
}

/** A long lower wick: sellers pushed down and were fully rejected. */
export function hammer(bar: Bar): PatternMatch | null {
  const total = range(bar);
  if (total === 0) return null;
  const lower = lowerWick(bar) / total;
  const upper = upperWick(bar) / total;
  if (lower < 0.5 || upper > 0.2 || bodyRatio(bar) > 0.4) return null;
  return {
    key: 'hammer',
    label: 'Hammer — lower rejection',
    direction: 'long',
    strength: Math.min(1, (lower - 0.5) / 0.35 + 0.4),
    detail: `Lower wick is ${(lower * 100).toFixed(0)}% of the bar`,
  };
}

/** A long upper wick: buyers pushed up and were fully rejected. */
export function shootingStar(bar: Bar): PatternMatch | null {
  const total = range(bar);
  if (total === 0) return null;
  const upper = upperWick(bar) / total;
  const lower = lowerWick(bar) / total;
  if (upper < 0.5 || lower > 0.2 || bodyRatio(bar) > 0.4) return null;
  return {
    key: 'shootingStar',
    label: 'Shooting star — upper rejection',
    direction: 'short',
    strength: Math.min(1, (upper - 0.5) / 0.35 + 0.4),
    detail: `Upper wick is ${(upper * 100).toFixed(0)}% of the bar`,
  };
}

/**
 * One bar's body entirely swallowing the previous bar's body, opposite colour.
 *
 * Compared body-to-body rather than range-to-range: an engulfing pattern is a
 * claim about where trading opened and closed, and wick overlap is noise.
 */
export function engulfing(prev: Bar, last: Bar): PatternMatch | null {
  if (isUp(prev) === isUp(last)) return null;
  const prevLow = Math.min(prev.open, prev.close);
  const prevHigh = Math.max(prev.open, prev.close);
  const lastLow = Math.min(last.open, last.close);
  const lastHigh = Math.max(last.open, last.close);
  if (lastLow > prevLow || lastHigh < prevHigh) return null;

  const prevBody = body(prev);
  const ratio = prevBody === 0 ? 2 : body(last) / prevBody;
  return {
    key: isUp(last) ? 'bullishEngulfing' : 'bearishEngulfing',
    label: isUp(last) ? 'Bullish engulfing' : 'Bearish engulfing',
    direction: isUp(last) ? 'long' : 'short',
    strength: Math.min(1, 0.4 + (ratio - 1) * 0.3),
    detail: `Body ${ratio.toFixed(1)}× the previous bar's, opposite direction`,
  };
}

/** A bar contained entirely within the previous bar: a coil, not a direction. */
export function insideBar(prev: Bar, last: Bar): PatternMatch | null {
  if (last.high > prev.high || last.low < prev.low) return null;
  const compression = range(prev) === 0 ? 0 : 1 - range(last) / range(prev);
  return {
    key: 'insideBar',
    label: 'Inside bar — compression',
    direction: isUp(prev) ? 'long' : 'short',
    strength: Math.min(0.6, compression),
    detail: `Range compressed ${(compression * 100).toFixed(0)}% inside the prior bar`,
  };
}

/**
 * Morning / evening star: impulse, stall, reversal.
 *
 * Three bars — a decisive bar, a small-bodied pause, then a decisive bar the
 * other way that recovers past the midpoint of the first. The midpoint test is
 * what separates a real reversal from a small bounce inside a downtrend.
 */
export function star(prior: Bar, middle: Bar, last: Bar): PatternMatch | null {
  if (bodyRatio(middle) > 0.35) return null;
  if (bodyRatio(prior) < 0.5 || bodyRatio(last) < 0.5) return null;
  if (isUp(prior) === isUp(last)) return null;

  const midpoint = (prior.open + prior.close) / 2;
  const bullish = isUp(last);
  if (bullish && (isUp(prior) || last.close <= midpoint)) return null;
  if (!bullish && (!isUp(prior) || last.close >= midpoint)) return null;

  return {
    key: bullish ? 'morningStar' : 'eveningStar',
    label: bullish ? 'Morning star' : 'Evening star',
    direction: bullish ? 'long' : 'short',
    strength: 0.7,
    detail: 'Impulse, stall, then a decisive reversal past the midpoint',
  };
}

/**
 * The net directional weight of a set of matches, −1 … +1.
 *
 * Averaged rather than summed so that a bar matching four weak definitions
 * does not out-score one matching a single strong one.
 */
export function patternBias(matches: readonly PatternMatch[]): number {
  if (matches.length === 0) return 0;
  const total = matches.reduce(
    (sum, match) => sum + (match.direction === 'long' ? match.strength : -match.strength),
    0,
  );
  return Math.max(-1, Math.min(1, total / matches.length));
}
