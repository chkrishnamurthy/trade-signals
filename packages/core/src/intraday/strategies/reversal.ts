import { formatPaise } from '@equitywise/shared';
import type { Series } from '../../types.js';
import type { EvaluationFrame } from '../frame.js';
import { trackBreak } from '../levels.js';
import { findSwings, type SwingPoint } from '../structure.js';
import type { InvalidationRule, Reason, StrategyEvidence, TradeDirection } from '../types.js';
import { proximity, reason, technicalLevels, volumeEvidence } from './shared.js';

/**
 * Reversal — the setup that must justify itself hardest.
 *
 * Counter-trend intraday trades have the worst base rate of anything in this
 * engine, so this strategy is written to decline rather than to find. Four
 * independent conditions are ALL required before it will even claim a setup is
 * forming, and a fifth before it triggers:
 *
 *   1. Price is at a level of real significance — a previous-day extreme, a
 *      session extreme. Reversing in open space is guessing.
 *   2. Evidence the move is exhausted: a momentum divergence, or a break of
 *      the level that has already failed.
 *   3. A rejection candle at the level, on the trigger bar.
 *   4. The prevailing trend is not overwhelming. ADX above roughly twice the
 *      trending threshold means the move is not interested in reversing yet.
 *   5. To trigger: volume on the rejection.
 *
 * A failed breakout is treated as first-class evidence here. It is the single
 * most reliable reversal tell available intraday, because it means the level
 * was tested with real intent and defended anyway.
 */

/** Only levels this significant are worth reversing at. */
const MIN_LEVEL_SIGNIFICANCE = 0.7;

export function reversalStrategy(frame: EvaluationFrame): StrategyEvidence[] {
  return [evaluate(frame, 'long'), evaluate(frame, 'short')].filter(
    (evidence): evidence is StrategyEvidence => evidence !== null,
  );
}

function evaluate(frame: EvaluationFrame, direction: TradeDirection): StrategyEvidence | null {
  const long = direction === 'long';
  const { config, snapshot } = frame;
  const last = frame.triggerBars.at(-1);
  const atr = frame.atrValue;
  if (last === undefined || atr === null || atr <= 0) return null;

  const near = proximity(frame);

  // --- 1. A level worth reversing at --------------------------------------
  // A long reversal happens at support, so the bar's LOW is what must have
  // reached the level; a short reversal is judged from the high. Using the
  // close instead would miss exactly the case that matters — the wick that
  // tagged the level and was rejected.
  const probe = long ? last.low : last.high;
  const distanceTo = (price: number): number => Math.abs(probe - price);
  const level = frame.levels
    .filter((candidate) => candidate.significance >= MIN_LEVEL_SIGNIFICANCE)
    .filter((candidate) =>
      long ? candidate.price <= last.close + near : candidate.price >= last.close - near,
    )
    .filter((candidate) => distanceTo(candidate.price) <= near * 2)
    .sort(
      (a, b) => b.significance - a.significance || distanceTo(a.price) - distanceTo(b.price),
    )[0];
  if (level === undefined) return null;

  const reasons: Reason[] = [
    reason(
      'atLevel',
      `At ${level.label.toLowerCase()}`,
      `Price is within ${formatPaise(Math.round(near * 2))} of ${formatPaise(level.price)}`,
      'priceAction',
    ),
  ];

  // --- 2. Exhaustion evidence ---------------------------------------------
  const divergence = findDivergence(frame, direction);
  const history = trackBreak(
    frame.sessionTriggerBars,
    level.price,
    long ? 'below' : 'above',
    config.structureLookback,
    near,
  );

  if (divergence !== null) reasons.push(divergence);
  if (history.failed) {
    reasons.push(
      reason(
        'failedBreak',
        long ? 'Breakdown failed' : 'Breakout failed',
        `Price closed ${long ? 'below' : 'above'} ${level.label.toLowerCase()} and was pushed back through it`,
        'priceAction',
      ),
    );
  }
  if (divergence === null && !history.failed) return null;

  // --- 3. Rejection at the level ------------------------------------------
  const rejection = frame.patterns.find(
    (pattern) =>
      pattern.direction === direction &&
      (pattern.key === 'hammer' ||
        pattern.key === 'shootingStar' ||
        pattern.key === 'bullishEngulfing' ||
        pattern.key === 'bearishEngulfing' ||
        pattern.key === 'morningStar' ||
        pattern.key === 'eveningStar'),
  );
  if (rejection === undefined) return null;
  reasons.push(reason(rejection.key, rejection.label, rejection.detail, 'priceAction'));

  // --- 4. The prevailing trend must not be overwhelming --------------------
  const trendRead = snapshot.trends.find((t) => t.minutes === config.timeframes.trend);
  const adx = snapshot.adx;
  if (
    adx !== null &&
    adx > config.volatility.trendingAdx * 2 &&
    trendRead?.direction !== direction
  ) {
    return null;
  }
  if (trendRead !== undefined) {
    reasons.push(
      reason(
        'counterTrend',
        trendRead.direction === direction
          ? `${config.timeframes.trend}m trend already agrees`
          : `Against the ${config.timeframes.trend}m trend`,
        trendRead.detail,
        'multiTimeframe',
        trendRead.direction === direction ? 'supporting' : 'opposing',
      ),
    );
  }

  // --- 5. Volume on the rejection ------------------------------------------
  const volume = volumeEvidence(frame, direction);
  reasons.push(...volume.reasons);
  const hasVolume = volume.score > 0.25;

  const vwapValue = snapshot.vwap;
  if (vwapValue !== null) {
    const towardVwap = long ? last.close < vwapValue : last.close > vwapValue;
    reasons.push(
      reason(
        'vwapTarget',
        towardVwap ? 'VWAP sits in the direction of the reversal' : 'Already through VWAP',
        `${snapshot.vwapDistancePercent?.toFixed(2) ?? '—'}% from VWAP`,
        'vwap',
        towardVwap ? 'supporting' : 'context',
      ),
    );
  }

  const triggered = hasVolume && rejection.strength >= 0.5;

  // The stop goes beyond the rejection bar's extreme. If price trades through
  // the very wick that defined the rejection, the rejection did not happen.
  const structuralStop = long ? last.low - near * 0.5 : last.high + near * 0.5;
  const levels = technicalLevels(direction, last.close, structuralStop, frame.atrLevels, config);

  const conviction = Math.max(
    0,
    Math.min(
      1,
      level.significance * 0.25 +
        (divergence === null ? 0 : 0.2) +
        (history.failed ? 0.2 : 0) +
        rejection.strength * 0.2 +
        volume.score * 0.15 -
        (trendRead !== undefined && trendRead.direction !== direction
          ? trendRead.strength * 0.2
          : 0),
    ),
  );

  const invalidations: InvalidationRule[] = [
    {
      kind: long ? 'price_below' : 'price_above',
      level: Math.round(structuralStop),
      label: 'Trades through the rejection extreme — the rejection failed',
    },
    { kind: 'session_end', label: 'Intraday only — exit before the session closes' },
  ];
  if (levels !== null) {
    invalidations.unshift({
      kind: long ? 'price_below' : 'price_above',
      level: levels.invalidation,
      label: 'Closes through the technical invalidation level',
    });
  }

  return {
    strategy: long ? 'reversal-long' : 'reversal-short',
    kind: long ? 'reversal_long' : 'reversal_short',
    direction,
    anchor: `level:${level.key}`,
    triggered,
    conviction,
    reasons,
    invalidations,
    levels,
    triggerMinutes: config.timeframes.trigger,
    setupMinutes: config.timeframes.setup,
    trendMinutes: config.timeframes.trend,
  };
}

/**
 * Momentum divergence between the last two confirmed swings.
 *
 * Bullish: price made a LOWER low while RSI made a HIGHER low — the second
 * push down had less force behind it than the first. Bearish is the mirror.
 *
 * Compared at confirmed swing points rather than at arbitrary bars, because
 * "the lowest close in twenty bars" moves every time a new bar prints and
 * produces a divergence roughly whenever you look for one.
 */
function findDivergence(frame: EvaluationFrame, direction: TradeDirection): Reason | null {
  // Swings are found on the full warm series so the RSI index lines up, then
  // restricted to today: a divergence measured against yesterday's low is a
  // statement about two different sessions.
  const sessionStart = frame.sessionTriggerBars[0]?.timestamp ?? 0;
  const swings = findSwings(frame.triggerBars, frame.config.swingLookback).filter(
    (swing) => swing.timestamp >= sessionStart,
  );
  const kind = direction === 'long' ? 'low' : 'high';
  const relevant = swings.filter((swing) => swing.kind === kind);
  const last = relevant.at(-1);
  const prior = relevant.at(-2);
  if (last === undefined || prior === undefined) return null;

  const rsiLast = rsiAt(frame.rsiSeries, last);
  const rsiPrior = rsiAt(frame.rsiSeries, prior);
  if (rsiLast === null || rsiPrior === null) return null;

  const diverges =
    direction === 'long'
      ? last.price < prior.price && rsiLast > rsiPrior
      : last.price > prior.price && rsiLast < rsiPrior;
  if (!diverges) return null;

  return reason(
    'momentumDivergence',
    direction === 'long' ? 'Bullish momentum divergence' : 'Bearish momentum divergence',
    `Price made a ${direction === 'long' ? 'lower low' : 'higher high'} while RSI made a ${direction === 'long' ? 'higher low' : 'lower high'} (${rsiPrior.toFixed(1)} → ${rsiLast.toFixed(1)})`,
    'momentum',
  );
}

function rsiAt(series: Series, swing: SwingPoint): number | null {
  const value = series[swing.index];
  return value === undefined ? null : value;
}
