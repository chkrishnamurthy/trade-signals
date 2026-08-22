import { ema } from '../../indicators/index.js';
import type { Bar } from '../../types.js';
import type { EvaluationFrame } from '../frame.js';
import type { InvalidationRule, Reason, StrategyEvidence, TradeDirection } from '../types.js';
import { proximity, reason, technicalLevels, volumeEvidence } from './shared.js';

/**
 * Trend continuation: the pullback entry.
 *
 * An established trend, a pullback into a reference (the fast EMA or VWAP),
 * and a bar that closes back in the direction of the trend. This is the
 * highest-base-rate intraday setup there is, and it is also the one most often
 * confused with catching a falling knife, so two things are required that a
 * naive version omits:
 *
 *   - The trend must be established on the HIGHER timeframe, not on the bar
 *     being traded. A pullback inside a 3m uptrend that is itself a leg of a
 *     15m downtrend is a continuation of the downtrend.
 *   - Price must have actually pulled back and RESUMED. Buying while price is
 *     still falling toward the EMA is not a continuation entry; it is a
 *     prediction that the EMA will hold.
 *
 * Volume behaviour here is the inverse of a breakout: volume should CONTRACT
 * into the pullback and expand on the resumption. Heavy volume on the pullback
 * itself means the other side is being served, which is how trends end.
 */

/** Bars back to look for the pullback touch. */
const PULLBACK_WINDOW = 8;

export function trendContinuationStrategy(frame: EvaluationFrame): StrategyEvidence[] {
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

  const trendRead = snapshot.trends.find((t) => t.minutes === config.timeframes.trend);
  const setupRead = snapshot.trends.find((t) => t.minutes === config.timeframes.setup);
  if (trendRead === undefined || trendRead.direction !== direction || trendRead.strength < 0.45) {
    return null;
  }

  const reasons: Reason[] = [
    reason(
      'higherTimeframeTrend',
      `${config.timeframes.trend}m trend is ${long ? 'bullish' : 'bearish'}`,
      trendRead.detail,
      'trend',
    ),
  ];
  if (setupRead !== undefined) {
    reasons.push(
      reason(
        'setupTimeframeTrend',
        `${config.timeframes.setup}m trend ${setupRead.direction === direction ? 'agrees' : setupRead.direction === 'flat' ? 'is neutral' : 'disagrees'}`,
        setupRead.detail,
        'multiTimeframe',
        setupRead.direction === direction
          ? 'supporting'
          : setupRead.direction === 'flat'
            ? 'context'
            : 'opposing',
      ),
    );
  }

  // --- The pullback reference: fast EMA on the trigger timeframe, or VWAP --
  const closes = frame.triggerBars.map((bar) => bar.close);
  const fastSeries = ema(closes, config.ema.fast);
  const fastEma = fastSeries.at(-1) ?? null;
  const reference =
    snapshot.vwap !== null && fastEma !== null
      ? long
        ? Math.max(snapshot.vwap, fastEma)
        : Math.min(snapshot.vwap, fastEma)
      : (fastEma ?? snapshot.vwap);
  if (reference === null) return null;

  const near = proximity(frame);
  const window = frame.triggerBars.slice(-PULLBACK_WINDOW);
  const touchIndex = findPullbackTouch(
    window,
    fastSeries,
    frame.triggerBars.length,
    direction,
    near,
  );
  if (touchIndex === null) return null;

  if (window[touchIndex] === undefined) return null;

  reasons.push(
    reason(
      'pullback',
      `Pulled back to the ${config.ema.fast} EMA`,
      `Touched the reference ${window.length - 1 - touchIndex} bars ago and held`,
      'priceAction',
    ),
  );

  // --- The resumption: the last bar closes back with the trend -------------
  const resumed = long
    ? last.close > last.open && last.close > reference
    : last.close < last.open && last.close < reference;
  const priorBars = window.slice(touchIndex, -1);
  const stillPullingBack = priorBars.length === 0;

  reasons.push(
    reason(
      'resumption',
      resumed ? 'Trend resumed off the pullback' : 'Pullback has not resumed yet',
      resumed
        ? `Trigger bar closed ${long ? 'above' : 'below'} the reference in the trend direction`
        : 'Waiting for a bar to close back in the trend direction',
      'priceAction',
      resumed ? 'supporting' : 'context',
    ),
  );

  // --- Volume: contraction into the pullback, expansion on resumption ------
  const pullbackVolume = averageVolume(window.slice(Math.max(0, touchIndex - 1), touchIndex + 1));
  const trendVolume = averageVolume(window.slice(0, Math.max(1, touchIndex)));
  const contracted = trendVolume > 0 && pullbackVolume < trendVolume;
  if (trendVolume > 0) {
    reasons.push(
      reason(
        'pullbackVolume',
        contracted ? 'Volume contracted into the pullback' : 'Volume rose into the pullback',
        `${(pullbackVolume / trendVolume).toFixed(2)}× the volume of the preceding advance`,
        'volume',
        contracted ? 'supporting' : 'opposing',
      ),
    );
  }

  const volume = volumeEvidence(frame, direction);
  reasons.push(...volume.reasons);

  const triggered = resumed && !stillPullingBack;

  // The stop goes beyond the pullback's extreme: if that gives way, the
  // pullback was the start of a reversal rather than a pause.
  const structuralStop = long
    ? Math.min(...window.slice(touchIndex).map((bar) => bar.low)) - near * 0.5
    : Math.max(...window.slice(touchIndex).map((bar) => bar.high)) + near * 0.5;

  const levels = technicalLevels(direction, last.close, structuralStop, frame.atrLevels, config);

  const conviction = Math.max(
    0,
    Math.min(
      1,
      trendRead.strength * 0.4 +
        (resumed ? 0.25 : 0) +
        (contracted ? 0.15 : 0) +
        volume.score * 0.2 +
        (setupRead?.direction === direction ? 0.1 : 0),
    ),
  );

  const invalidations: InvalidationRule[] = [
    {
      kind: long ? 'price_below' : 'price_above',
      level: Math.round(structuralStop),
      label: 'Closes beyond the pullback extreme — the pause became a reversal',
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
    strategy: long ? 'trend-continuation-long' : 'trend-continuation-short',
    kind: long ? 'trend_continuation_long' : 'trend_continuation_short',
    direction,
    // Anchored to the setup, not to the bar that happens to be the pullback low
    // right now. That bar moves as the window slides, and keying on it would
    // expire the signal and create an identical replacement on every cycle —
    // the duplicate spam the lifecycle exists to prevent. One live continuation
    // per direction per symbol is the honest identity; the cool-down governs
    // when a genuinely new one may form.
    anchor: 'pullback',
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
 * The most recent bar in `window` that touched the fast EMA from the trend side.
 *
 * Returns an index into `window`, or null when price never came back to the
 * reference — in which case there is no pullback and no continuation entry,
 * only an extended move that this strategy deliberately does not chase.
 */
function findPullbackTouch(
  window: readonly Bar[],
  fastSeries: readonly (number | null)[],
  totalBars: number,
  direction: TradeDirection,
  tolerance: number,
): number | null {
  const offset = totalBars - window.length;
  for (let i = window.length - 1; i >= 0; i -= 1) {
    const bar = window[i];
    const reference = fastSeries[offset + i];
    if (bar === undefined || reference === null || reference === undefined) continue;
    const touched =
      direction === 'long' ? bar.low <= reference + tolerance : bar.high >= reference - tolerance;
    if (touched) return i;
  }
  return null;
}

function averageVolume(bars: readonly Bar[]): number {
  if (bars.length === 0) return 0;
  return bars.reduce((sum, bar) => sum + bar.volume, 0) / bars.length;
}
