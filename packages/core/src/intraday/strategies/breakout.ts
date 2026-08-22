import { formatPaise } from '@signal/shared';
import type { EvaluationFrame } from '../frame.js';
import {
  brokenAbove,
  brokenBelow,
  nearestResistance,
  nearestSupport,
  trackBreak,
} from '../levels.js';
import { patternBias } from '../patterns.js';
import type { InvalidationRule, Reason, StrategyEvidence, TradeDirection } from '../types.js';
import { breakBuffer, proximity, reason, technicalLevels, volumeEvidence } from './shared.js';

/**
 * Breakout and breakdown.
 *
 * The rule this strategy exists to enforce: a breakout is not "price made a
 * new high". It is a decisive close through a level that mattered, with
 * participation behind it and a trend that does not object. Without those,
 * the overwhelming majority of intraday level breaks are noise that reverses
 * within a few bars, and an engine that fires on all of them produces mostly
 * losses and a great deal of confidence.
 *
 * Four things are therefore required before `triggered` is true:
 *   1. The previous bar closed on the other side of the level — this is a
 *      fresh break, not the fourth bar of one that already happened.
 *   2. The close clears the level by a buffer scaled to ATR.
 *   3. The level carries real significance (previous-day extreme, opening
 *      range, a confirmed swing), not merely "the highest bar of the last ten".
 *   4. The higher timeframe is not actively opposing.
 *
 * A level being APPROACHED produces evidence with `triggered: false`. That is
 * what the `forming` lifecycle state is for: worth watching, not worth acting.
 */

export function breakoutStrategy(frame: EvaluationFrame): StrategyEvidence[] {
  const last = frame.triggerBars.at(-1);
  const prev = frame.triggerBars.at(-2);
  if (last === undefined || prev === undefined) return [];

  return [
    evaluate(frame, 'long', last.close, prev.close),
    evaluate(frame, 'short', last.close, prev.close),
  ].filter((evidence): evidence is StrategyEvidence => evidence !== null);
}

function evaluate(
  frame: EvaluationFrame,
  direction: TradeDirection,
  close: number,
  previousClose: number,
): StrategyEvidence | null {
  const long = direction === 'long';
  const buffer = breakBuffer(frame);
  const near = proximity(frame);
  const { snapshot, config } = frame;

  const broken = long
    ? brokenAbove(frame.levels, close, previousClose, buffer)
    : brokenBelow(frame.levels, close, previousClose, buffer);

  const approaching = long
    ? nearestResistance(frame.levels, close)
    : nearestSupport(frame.levels, close);

  const level = broken ?? approaching;
  if (level === null) return null;

  // A level worth breaking. Below this, the "breakout" is just a new high.
  const MIN_SIGNIFICANCE = 0.6;
  if (level.significance < MIN_SIGNIFICANCE) return null;

  const triggered = broken !== null;
  if (!triggered && Math.abs(close - level.price) > near) return null;

  const reasons: Reason[] = [];
  reasons.push(
    reason(
      triggered ? 'levelBroken' : 'levelApproaching',
      triggered
        ? `${long ? 'Broke above' : 'Broke below'} ${level.label.toLowerCase()}`
        : `Approaching ${level.label.toLowerCase()}`,
      triggered
        ? `Closed ${long ? 'above' : 'below'} ${paise(level.price)} by ${paise(Math.abs(close - level.price))}`
        : `Within ${paise(Math.abs(close - level.price))} of ${paise(level.price)}`,
      'priceAction',
    ),
  );

  // A break that has already failed once is the strongest evidence there is
  // that the level is being defended.
  const history = trackBreak(
    frame.sessionTriggerBars,
    level.price,
    long ? 'above' : 'below',
    config.structureLookback,
    near,
  );
  if (history.failed) {
    reasons.push(
      reason(
        'previousBreakFailed',
        'An earlier break of this level failed',
        'Price closed back through the level after breaking it',
        'priceAction',
        'opposing',
      ),
    );
  }
  if (history.retested) {
    reasons.push(
      reason(
        'levelRetested',
        'Level retested and held',
        'Price returned to the level after breaking and closed on the new side',
        'priceAction',
      ),
    );
  }

  // Range expansion: a break out of a tight coil travels further than a break
  // out of an already-wide range, which has spent its energy.
  const range = frame.range;
  if (range?.consolidating === true) {
    reasons.push(
      reason(
        'rangeCompressed',
        'Broke out of a compressed range',
        `Range was ${range.widthInAtr?.toFixed(1) ?? '—'}× ATR before the break`,
        'volatility',
      ),
    );
  }
  if (range?.expanding === true) {
    reasons.push(
      reason(
        'rangeExpansion',
        'Range expansion on the break',
        `Trigger bar spanned ${range.lastBarInAtr?.toFixed(1) ?? '—'}× ATR`,
        'volatility',
      ),
    );
  }

  const volume = volumeEvidence(frame, direction);
  reasons.push(...volume.reasons);

  // The higher timeframe gets a veto on breakouts specifically: fading a 15m
  // downtrend by buying a 3m break of a minor high is the single most common
  // way an intraday engine loses money.
  const trendRead = snapshot.trends.find((t) => t.minutes === config.timeframes.trend);
  if (
    trendRead !== undefined &&
    trendRead.direction !== direction &&
    trendRead.direction !== 'flat'
  ) {
    if (trendRead.strength > 0.5) return null;
    reasons.push(
      reason(
        'higherTimeframeOpposes',
        `${config.timeframes.trend}m trend leans the other way`,
        trendRead.detail,
        'multiTimeframe',
        'opposing',
      ),
    );
  }

  const bias = patternBias(frame.patterns);
  if ((long && bias > 0.3) || (!long && bias < -0.3)) {
    const match = frame.patterns.find((p) => p.direction === direction);
    if (match !== undefined) {
      reasons.push(reason(match.key, match.label, match.detail, 'priceAction'));
    }
  }

  const structuralStop = long
    ? Math.min(level.price - buffer, frame.triggerBars.at(-1)?.low ?? level.price)
    : Math.max(level.price + buffer, frame.triggerBars.at(-1)?.high ?? level.price);

  const levels = technicalLevels(direction, close, structuralStop, frame.atrValue, config);

  const conviction = clamp(
    level.significance * 0.4 +
      volume.score * 0.35 +
      (history.retested ? 0.15 : 0) +
      (range?.expanding === true ? 0.1 : 0) -
      (history.failed ? 0.25 : 0),
  );

  const invalidations: InvalidationRule[] = [
    {
      kind: long ? 'price_below' : 'price_above',
      level: structuralStop,
      label: `${long ? 'Loses' : 'Reclaims'} ${level.label.toLowerCase()} — the break has failed`,
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
    strategy: long ? 'breakout' : 'breakdown',
    kind: long ? 'breakout' : 'breakdown',
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

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Paise to a display string, for evidence text.
 *
 * Routed through `formatPaise` rather than dividing by 100, so no rupee float
 * exists even momentarily (CLAUDE.md hard rule 3). Evidence strings are the one
 * place the pure engine produces human-readable output, and they are stored
 * verbatim so the UI can render an explanation without recomputing anything.
 */
function paise(value: number): string {
  return formatPaise(Math.round(value));
}
