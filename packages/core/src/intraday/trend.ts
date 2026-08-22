import { adx as computeAdx, ema } from '../indicators/index.js';
import { type Bar, latest } from '../types.js';
import type { IntradayConfig } from './config.js';
import type { TradeDirection, TrendRead } from './types.js';

/**
 * Trend on one timeframe.
 *
 * Direction comes from EMA stacking, which is a structural claim (each
 * successive average is above the next, so every lookback window agrees).
 * Strength combines three independent pieces of evidence:
 *
 *   - stacking, which says the averages agree;
 *   - ADX, which says there is a trend at all rather than a drift;
 *   - the fast EMA's slope, which says the trend is still moving.
 *
 * They are independent on purpose. A stacked but flat set of EMAs with ADX at
 * 12 is a range that happens to be sloping, and scoring it as a strong trend is
 * how an engine ends up buying the top of a two-hour chop.
 */

/** Minimum bars before a timeframe's trend is worth reading at all. */
function minimumBars(config: IntradayConfig): number {
  return config.ema.medium + 5;
}

export function readTrend(
  bars: readonly Bar[],
  minutes: number,
  config: IntradayConfig,
): TrendRead {
  if (bars.length < minimumBars(config)) {
    return {
      minutes,
      direction: 'flat',
      strength: 0,
      ema9: null,
      ema20: null,
      ema50: null,
      adx: null,
      detail: `Only ${bars.length} bars on the ${minutes}m timeframe — not enough to read a trend`,
    };
  }

  const closes = bars.map((bar) => bar.close);
  const fastSeries = ema(closes, config.ema.fast);
  const fast = latest(fastSeries);
  const medium = latest(ema(closes, config.ema.medium));
  const slow = latest(ema(closes, config.ema.slow));
  const adxValue = latest(computeAdx(bars, config.adxPeriod).adx);
  const close = bars.at(-1)?.close ?? 0;

  if (fast === null || medium === null) {
    return {
      minutes,
      direction: 'flat',
      strength: 0,
      ema9: fast,
      ema20: medium,
      ema50: slow,
      adx: adxValue,
      detail: `Moving averages have not warmed up on the ${minutes}m timeframe`,
    };
  }

  const stackedUp = close > fast && fast > medium && (slow === null || medium > slow);
  const stackedDown = close < fast && fast < medium && (slow === null || medium < slow);
  const leaningUp = close > medium && fast > medium;
  const leaningDown = close < medium && fast < medium;

  let direction: TradeDirection | 'flat' = 'flat';
  let stackScore = 0;
  if (stackedUp) {
    direction = 'long';
    stackScore = 1;
  } else if (stackedDown) {
    direction = 'short';
    stackScore = 1;
  } else if (leaningUp) {
    direction = 'long';
    stackScore = 0.5;
  } else if (leaningDown) {
    direction = 'short';
    stackScore = 0.5;
  }

  // Slope of the fast EMA over its own period, as a fraction of ATR-free
  // percentage — a ratio, so a float.
  const priorFast = fastSeries.at(-1 - config.ema.fast) ?? null;
  const slopePercent =
    priorFast === null || priorFast === 0 ? null : ((fast - priorFast) / priorFast) * 100;
  const slopeScore =
    slopePercent === null
      ? 0
      : Math.min(1, Math.abs(slopePercent) / 0.35) *
        (Math.sign(slopePercent) === (direction === 'short' ? -1 : 1) ? 1 : 0);

  const adxScore =
    adxValue === null
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            (adxValue - config.volatility.choppyAdx) /
              Math.max(1, config.volatility.trendingAdx * 2 - config.volatility.choppyAdx),
          ),
        );

  const strength =
    direction === 'flat' ? 0 : Math.min(1, stackScore * 0.5 + adxScore * 0.3 + slopeScore * 0.2);

  const parts: string[] = [];
  parts.push(
    stackedUp
      ? 'EMAs stacked bullish'
      : stackedDown
        ? 'EMAs stacked bearish'
        : direction === 'flat'
          ? 'EMAs tangled'
          : `Price ${direction === 'long' ? 'above' : 'below'} the ${config.ema.medium} EMA`,
  );
  if (adxValue !== null) parts.push(`ADX ${adxValue.toFixed(0)}`);
  if (slopePercent !== null) parts.push(`${config.ema.fast} EMA slope ${slopePercent.toFixed(2)}%`);

  return {
    minutes,
    direction,
    strength,
    ema9: fast,
    ema20: medium,
    ema50: slow,
    adx: adxValue,
    detail: parts.join(' · '),
  };
}

/**
 * How well a set of timeframes agree with a direction, 0-1.
 *
 * Weighted toward the higher timeframe deliberately: a 1m disagreement with a
 * 15m trend is normal noise, whereas a 15m disagreement with a 1m trigger means
 * the trigger is fighting the tide. The weights are the timeframe lengths
 * themselves, which encodes exactly that.
 */
export function alignmentScore(trends: readonly TrendRead[], direction: TradeDirection): number {
  const weighted = trends.reduce(
    (sum, trend) => {
      const weight = trend.minutes;
      const agreement =
        trend.direction === direction
          ? trend.strength
          : trend.direction === 'flat'
            ? 0
            : -trend.strength;
      return { score: sum.score + agreement * weight, weight: sum.weight + weight };
    },
    { score: 0, weight: 0 },
  );
  if (weighted.weight === 0) return 0;
  // Map −1…+1 onto 0…1: full disagreement scores zero, not a negative that
  // would then be clamped and lose the distinction from "flat".
  return Math.max(0, Math.min(1, (weighted.score / weighted.weight + 1) / 2));
}
