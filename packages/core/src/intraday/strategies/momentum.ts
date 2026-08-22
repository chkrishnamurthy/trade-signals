import type { EvaluationFrame } from '../frame.js';
import type { InvalidationRule, Reason, StrategyEvidence, TradeDirection } from '../types.js';
import { reason, technicalLevels, volumeEvidence, volumeThresholds } from './shared.js';

/**
 * Momentum continuation.
 *
 * The setup with no level attached: price is moving, the move is accelerating,
 * and participation is behind it. Because there is no structural anchor, the
 * bar for triggering is higher than anywhere else in the engine — every
 * condition below is required, not merely scored.
 *
 * The RSI treatment is the part worth reading. "RSI over 70 is a sell" is the
 * most-repeated and least-useful rule in technical analysis: in a real trend
 * RSI lives above 70 for hours, and fading it means fighting the whole move.
 * What this reads instead is whether RSI is *holding a bullish range* — above
 * 50, below genuine exhaustion — which is a statement about the regime rather
 * than about a threshold crossing.
 */

/** The move must span at least this many ATRs over the fast ROC window. */
const MIN_IMPULSE_ATR = 1.0;

export function momentumStrategy(frame: EvaluationFrame): StrategyEvidence[] {
  return [evaluate(frame, 'long'), evaluate(frame, 'short')].filter(
    (evidence): evidence is StrategyEvidence => evidence !== null,
  );
}

function evaluate(frame: EvaluationFrame, direction: TradeDirection): StrategyEvidence | null {
  const long = direction === 'long';
  const { snapshot, config } = frame;
  const atr = frame.atrValue;
  const last = frame.triggerBars.at(-1);
  if (atr === null || atr <= 0 || last === undefined) return null;

  // --- Impulse: is the move big enough to be a move? ----------------------
  // Measured within the session: an impulse spanning the overnight gap is a
  // gap, and calling it momentum would fire on every gap-up open.
  const anchor = frame.sessionTriggerBars.at(-1 - config.roc.fast);
  if (anchor === undefined) return null;
  const impulse = (last.close - anchor.close) / atr;
  if (long ? impulse < MIN_IMPULSE_ATR : impulse > -MIN_IMPULSE_ATR) return null;

  const reasons: Reason[] = [
    reason(
      'impulse',
      'Directional impulse',
      `${Math.abs(impulse).toFixed(1)}× ATR over the last ${config.roc.fast} bars`,
      'momentum',
    ),
  ];

  // --- Acceleration: is it still speeding up, or is it the tail? ----------
  const { rocFast, rocSlow } = snapshot;
  const accelerating =
    rocFast !== null && rocSlow !== null && (long ? rocFast > rocSlow : rocFast < rocSlow);
  if (rocFast !== null && rocSlow !== null) {
    reasons.push(
      reason(
        'acceleration',
        accelerating ? 'Move is accelerating' : 'Move is decelerating',
        `${config.roc.fast}-bar rate of change ${rocFast.toFixed(2)}% vs ${config.roc.slow}-bar ${rocSlow.toFixed(2)}%`,
        'momentum',
        accelerating ? 'supporting' : 'opposing',
      ),
    );
  }

  // --- MACD histogram: expanding means the momentum is still building -----
  const hist = frame.macdHistogramSeries.at(-1) ?? null;
  const histPrev = frame.macdHistogramSeries.at(-2) ?? null;
  const histAgrees = hist !== null && (long ? hist > 0 : hist < 0);
  const histExpanding =
    hist !== null && histPrev !== null && Math.abs(hist) > Math.abs(histPrev) && histAgrees;
  if (hist !== null) {
    reasons.push(
      reason(
        'macdHistogram',
        histExpanding
          ? 'MACD histogram expanding'
          : histAgrees
            ? 'MACD histogram agrees but is flattening'
            : 'MACD histogram opposes the move',
        `Histogram ${hist > 0 ? 'positive' : 'negative'}${histPrev === null ? '' : `, ${Math.abs(hist) > Math.abs(histPrev) ? 'widening' : 'narrowing'}`}`,
        'momentum',
        histExpanding ? 'supporting' : histAgrees ? 'context' : 'opposing',
      ),
    );
  }
  if (!histAgrees) return null;

  // --- RSI: regime, not threshold ----------------------------------------
  const rsi = snapshot.rsi;
  const band = long ? config.rsi.bullBand : config.rsi.bearBand;
  let rsiHealthy = false;
  if (rsi !== null) {
    const exhausted = long ? rsi > config.rsi.overbought : rsi < config.rsi.oversold;
    rsiHealthy = long ? rsi >= band.min && !exhausted : rsi <= band.max && !exhausted;
    reasons.push(
      reason(
        'rsiRegime',
        exhausted
          ? 'RSI is stretched'
          : rsiHealthy
            ? `RSI holding a ${long ? 'bullish' : 'bearish'} range`
            : 'RSI does not confirm',
        `RSI ${rsi.toFixed(1)} (${long ? 'bullish' : 'bearish'} range ${band.min}–${band.max})`,
        'momentum',
        exhausted ? 'context' : rsiHealthy ? 'supporting' : 'opposing',
      ),
    );
    if (!rsiHealthy && !exhausted) return null;
  }

  // --- Trend strength: momentum inside chop reverts ------------------------
  const adx = snapshot.adx;
  if (adx !== null) {
    const trending = adx >= config.volatility.trendingAdx;
    reasons.push(
      reason(
        'adx',
        trending ? 'Trend strength confirms' : 'Trend strength is weak',
        `ADX ${adx.toFixed(0)} (trending above ${config.volatility.trendingAdx})`,
        'trend',
        trending ? 'supporting' : 'opposing',
      ),
    );
    if (adx < config.volatility.choppyAdx) return null;
  }

  // --- VWAP side ----------------------------------------------------------
  const vwapValue = snapshot.vwap;
  const vwapAgrees =
    vwapValue === null ? null : long ? last.close > vwapValue : last.close < vwapValue;
  if (vwapValue !== null) {
    reasons.push(
      reason(
        'vwapSide',
        vwapAgrees === true
          ? `Price ${long ? 'above' : 'below'} VWAP`
          : `Price on the wrong side of VWAP`,
        `${snapshot.vwapDistancePercent?.toFixed(2) ?? '—'}% from VWAP`,
        'vwap',
        vwapAgrees === true ? 'supporting' : 'opposing',
      ),
    );
    if (vwapAgrees === false) return null;
  }

  const volume = volumeEvidence(frame, direction);
  reasons.push(...volume.reasons);

  const thresholds = volumeThresholds(frame);
  const hasVolume =
    (frame.volume.barRelativeVolume ?? 0) >= thresholds.participation ||
    (frame.volume.relativeVolume ?? 0) >= thresholds.participation;

  const patternMatch = frame.patterns.find(
    (p) => p.direction === direction && p.key === 'momentumCandle',
  );
  if (patternMatch !== undefined) {
    reasons.push(reason(patternMatch.key, patternMatch.label, patternMatch.detail, 'priceAction'));
  }

  // Everything must hold for a trigger. A momentum signal has no level to fall
  // back on, so a partial setup is only ever worth watching.
  const triggered = accelerating && histExpanding && hasVolume && rsiHealthy;

  // The stop is the low of the impulse's last pullback, approximated by the
  // extreme of the recent trigger bars — momentum setups have no level.
  const recent = frame.sessionTriggerBars.slice(-Math.max(3, config.roc.fast));
  const structuralStop = long
    ? Math.min(...recent.map((bar) => bar.low))
    : Math.max(...recent.map((bar) => bar.high));

  const levels = technicalLevels(direction, last.close, structuralStop, frame.atrLevels, config);

  const conviction = Math.max(
    0,
    Math.min(
      1,
      0.25 +
        (accelerating ? 0.2 : 0) +
        (histExpanding ? 0.15 : 0) +
        volume.score * 0.25 +
        (adx === null
          ? 0
          : Math.min(0.15, Math.max(0, (adx - config.volatility.trendingAdx) / 100))),
    ),
  );

  const invalidations: InvalidationRule[] = [
    { kind: 'momentum_reversed', label: 'MACD histogram turns against the move' },
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
    strategy: long ? 'momentum-long' : 'momentum-short',
    kind: long ? 'momentum_long' : 'momentum_short',
    direction,
    anchor: 'impulse',
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
