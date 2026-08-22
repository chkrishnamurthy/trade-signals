import { formatPaise } from '@signal/shared';
import type { EvaluationFrame } from '../frame.js';
import type { InvalidationRule, Reason, StrategyEvidence, TradeDirection } from '../types.js';
import { breakBuffer, proximity, reason, technicalLevels, volumeEvidence } from './shared.js';

/**
 * VWAP reclaim and VWAP breakdown.
 *
 * VWAP is the intraday reference: it is the average price everyone who traded
 * today actually paid, so crossing it flips who is in profit on the session.
 * That makes a reclaim a genuine change in intraday control rather than a
 * chart pattern.
 *
 * Three conditions separate a reclaim from a wobble around a line:
 *   - price spent the preceding bars on the OTHER side, so this is a change
 *     of state rather than the third crossing in ten minutes;
 *   - VWAP itself is not sloping against the reclaim — reclaiming a falling
 *     VWAP is a bounce inside a downtrend;
 *   - volume confirms.
 *
 * The chop guard matters most. Price oscillating across a flat VWAP produces a
 * reclaim signal every few bars, all of which fail, and it is the single
 * easiest way to make an intraday engine look busy and be useless.
 */

/** Bars price must have spent on the other side for a cross to mean anything. */
const MIN_BARS_OTHER_SIDE = 3;
/** More crossings than this in the lookback and the level is being chopped. */
const MAX_RECENT_CROSSINGS = 3;

export function vwapStrategy(frame: EvaluationFrame): StrategyEvidence[] {
  const vwapValue = frame.snapshot.vwap;
  const last = frame.triggerBars.at(-1);
  const prev = frame.triggerBars.at(-2);
  if (vwapValue === null || last === undefined || prev === undefined) return [];

  return [evaluate(frame, 'long', vwapValue), evaluate(frame, 'short', vwapValue)].filter(
    (evidence): evidence is StrategyEvidence => evidence !== null,
  );
}

function evaluate(
  frame: EvaluationFrame,
  direction: TradeDirection,
  vwapValue: number,
): StrategyEvidence | null {
  const long = direction === 'long';
  const { config, snapshot } = frame;
  const buffer = breakBuffer(frame);
  const near = proximity(frame);

  const last = frame.triggerBars.at(-1);
  const prev = frame.triggerBars.at(-2);
  if (last === undefined || prev === undefined) return null;

  const above = last.close > vwapValue + buffer;
  const below = last.close < vwapValue - buffer;
  const wasAbove = prev.close > vwapValue;

  const crossedNow = long ? above && !wasAbove : below && wasAbove;
  const holdingSide = long ? above : below;

  // Not on the right side and not near enough to be forming: nothing here.
  if (!holdingSide && Math.abs(last.close - vwapValue) > near) return null;

  // Today's bars only: a "crossing" counted across the overnight gap is not a
  // crossing, and VWAP itself resets at the session open.
  const window = frame.sessionTriggerBars.slice(-config.structureLookback);
  const vwapAt = frame.vwapSeries.at(-1) ?? vwapValue;
  const crossings = countCrossings(window, vwapAt);
  if (crossings > MAX_RECENT_CROSSINGS) {
    // Chop. Reporting this as an opposing reason on a signal nobody sees is
    // worse than declining to produce one.
    return null;
  }

  const priorBars = window.slice(0, -1);
  const barsOtherSide = priorBars.filter((bar) =>
    long ? bar.close < vwapAt : bar.close > vwapAt,
  ).length;

  const triggered = crossedNow && barsOtherSide >= MIN_BARS_OTHER_SIDE;

  const reasons: Reason[] = [];
  reasons.push(
    reason(
      triggered ? 'vwapCrossed' : 'vwapSide',
      triggered
        ? long
          ? 'Reclaimed VWAP'
          : 'Lost VWAP'
        : long
          ? 'Holding above VWAP'
          : 'Holding below VWAP',
      triggered
        ? `Closed ${long ? 'above' : 'below'} VWAP at ${formatPaise(vwapValue)} after ${barsOtherSide} bars on the other side`
        : `${formatPaise(Math.abs(last.close - vwapValue))} ${long ? 'above' : 'below'} VWAP`,
      'vwap',
    ),
  );

  const slope = snapshot.vwapSlopePercent;
  if (slope !== null) {
    const agrees = long ? slope >= -0.02 : slope <= 0.02;
    reasons.push(
      reason(
        'vwapSlope',
        agrees ? 'VWAP slope supports the move' : 'VWAP slope opposes the move',
        `VWAP ${slope >= 0 ? 'rising' : 'falling'} ${Math.abs(slope).toFixed(3)}% over the last few bars`,
        'vwap',
        agrees ? 'supporting' : 'opposing',
      ),
    );
    // Reclaiming a VWAP that is falling hard is a counter-trend bounce and is
    // not what this strategy claims to detect.
    if (!agrees && Math.abs(slope) > 0.08) return null;
  }

  if (crossings > 1) {
    reasons.push(
      reason(
        'vwapChoppy',
        'VWAP has been crossed repeatedly',
        `${crossings} crossings in the last ${window.length} bars`,
        'vwap',
        'opposing',
      ),
    );
  }

  const volume = volumeEvidence(frame, direction);
  reasons.push(...volume.reasons);

  const trendRead = snapshot.trends.find((t) => t.minutes === config.timeframes.trend);
  if (trendRead !== undefined) {
    const agrees = trendRead.direction === direction;
    reasons.push(
      reason(
        'higherTimeframe',
        `${config.timeframes.trend}m trend ${agrees ? 'supports' : trendRead.direction === 'flat' ? 'is neutral on' : 'opposes'} the reclaim`,
        trendRead.detail,
        'multiTimeframe',
        agrees ? 'supporting' : trendRead.direction === 'flat' ? 'context' : 'opposing',
      ),
    );
  }

  // The stop belongs on the far side of VWAP: if price closes back through it,
  // the premise — that control has changed hands — is simply false.
  const structuralStop = long
    ? Math.min(vwapValue - buffer, last.low)
    : Math.max(vwapValue + buffer, last.high);

  const levels = technicalLevels(direction, last.close, structuralStop, frame.atrValue, config);

  const conviction = Math.max(
    0,
    Math.min(
      1,
      0.35 +
        volume.score * 0.35 +
        (barsOtherSide >= MIN_BARS_OTHER_SIDE ? 0.2 : 0) +
        (trendRead?.direction === direction ? 0.15 : 0) -
        crossings * 0.08,
    ),
  );

  const invalidations: InvalidationRule[] = [
    {
      kind: long ? 'vwap_lost' : 'vwap_reclaimed',
      label: long ? 'Closes back below VWAP' : 'Closes back above VWAP',
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
    strategy: long ? 'vwap-reclaim' : 'vwap-breakdown',
    kind: long ? 'vwap_reclaim' : 'vwap_breakdown',
    direction,
    anchor: 'vwap',
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

/** Closes that changed side of `level` within the window. */
function countCrossings(bars: readonly { close: number }[], level: number): number {
  let crossings = 0;
  for (let i = 1; i < bars.length; i += 1) {
    const now = bars[i]?.close;
    const before = bars[i - 1]?.close;
    if (now === undefined || before === undefined) continue;
    if (now > level !== before > level) crossings += 1;
  }
  return crossings;
}
