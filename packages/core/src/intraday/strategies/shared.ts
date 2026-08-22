import type { IntradayConfig } from '../config.js';
import type { EvaluationFrame } from '../frame.js';
import type { Reason, ScoreCategory, TechnicalLevels, TradeDirection } from '../types.js';

/**
 * Shared strategy machinery.
 *
 * Every strategy produces the same shape of evidence, so the confluence engine
 * can compare a breakout against a VWAP reclaim without knowing anything about
 * either. What lives here is the part that must be identical across all of
 * them: how a reason is worded, and how technical levels are derived.
 */

export function reason(
  key: string,
  label: string,
  detail: string,
  category: ScoreCategory,
  polarity: Reason['polarity'] = 'supporting',
): Reason {
  return { key, label, detail, category, polarity };
}

/**
 * Technical levels for a setup. These are chart levels, NOT orders.
 *
 * The invalidation level is the structural one — the price that proves the
 * premise wrong, such as the far side of the range that was broken — clamped
 * into a sane ATR band. Structure alone can put the stop absurdly far away
 * after a wide bar, and a pure ATR stop ignores the structure that made the
 * setup interesting in the first place; the clamp takes the better half of
 * each.
 *
 * Targets are ATR multiples rather than the next level, because the next level
 * is sometimes two ticks away and sometimes the previous week's high. An ATR
 * multiple gives a comparable reward figure across every symbol, which is what
 * the risk/reward filter needs to mean anything.
 *
 * Returns null when ATR has not warmed up: a level structure derived from no
 * volatility estimate would be a fabricated number.
 */
export function technicalLevels(
  direction: TradeDirection,
  entry: number,
  structuralStop: number | null,
  atr: number | null,
  config: IntradayConfig,
): TechnicalLevels | null {
  if (atr === null || atr <= 0 || entry <= 0) return null;

  const { stopAtr, target1Atr, target2Atr } = config.targets;
  const sign = direction === 'long' ? 1 : -1;

  const atrStop = entry - sign * stopAtr * atr;
  const minDistance = 0.5 * stopAtr * atr;
  const maxDistance = 2 * stopAtr * atr;

  let invalidation = atrStop;
  if (structuralStop !== null) {
    const distance = Math.abs(entry - structuralStop);
    const onTheRightSide = direction === 'long' ? structuralStop < entry : structuralStop > entry;
    if (onTheRightSide && distance >= minDistance && distance <= maxDistance) {
      invalidation = structuralStop;
    }
  }
  invalidation = Math.round(invalidation);

  const risk = Math.abs(entry - invalidation);
  if (risk <= 0) return null;

  const target1 = Math.round(entry + sign * target1Atr * atr);
  const target2 = Math.round(entry + sign * target2Atr * atr);
  const reward = Math.abs(target1 - entry);

  // The zone, not a price: the setup's premise holds across a small band
  // around the trigger, and quoting a single number implies a precision the
  // analysis does not have.
  const halfZone = Math.max(1, Math.round(0.15 * atr));

  return {
    entryLow: Math.round(entry - halfZone),
    entryHigh: Math.round(entry + halfZone),
    invalidation,
    target1,
    target2,
    risk,
    reward,
    riskReward: risk === 0 ? null : reward / risk,
  };
}

/** The break buffer in paise: a close must clear a level by this much. */
export function breakBuffer(frame: EvaluationFrame): number {
  const atr = frame.atrValue;
  return atr === null ? 0 : atr * frame.config.levels.breakBufferAtr;
}

/** How close counts as "at" a level, in paise. */
export function proximity(frame: EvaluationFrame): number {
  const atr = frame.atrValue;
  return atr === null ? 0 : atr * frame.config.levels.proximityAtr;
}

/** The relative-volume bar for this regime, already adjusted. */
export function volumeThresholds(frame: EvaluationFrame): {
  readonly participation: number;
  readonly spike: number;
} {
  const profile =
    frame.config.regimes[
      frame.regime === 'pre_open' || frame.regime === 'closed' ? 'mid' : frame.regime
    ];
  const multiplier = profile?.volumeMultiplier ?? 1;
  return {
    participation: frame.config.volume.participationThreshold * multiplier,
    spike: frame.config.volume.spikeThreshold * multiplier,
  };
}

/**
 * Volume evidence for a directional move, and how much it supports it, 0-1.
 *
 * Volume confirms; it does not lead. Heavy volume on a bar going the wrong way
 * is evidence against the setup, not neutral, so the score can be zero even
 * when participation is enormous.
 */
export function volumeEvidence(
  frame: EvaluationFrame,
  direction: TradeDirection,
): { readonly score: number; readonly reasons: Reason[] } {
  const { relativeVolume, barRelativeVolume } = frame.volume;
  const thresholds = volumeThresholds(frame);
  const reasons: Reason[] = [];

  if (relativeVolume === null && barRelativeVolume === null) {
    reasons.push(
      reason(
        'volumeUnknown',
        'Volume comparison unavailable',
        'No intraday volume profile for this symbol yet',
        'volume',
        'context',
      ),
    );
    return { score: 0, reasons };
  }

  const lastBar = frame.triggerBars.at(-1);
  const barAgrees =
    lastBar === undefined
      ? true
      : direction === 'long'
        ? lastBar.close >= lastBar.open
        : lastBar.close <= lastBar.open;

  let score = 0;

  if (relativeVolume !== null) {
    if (relativeVolume >= thresholds.participation) {
      score +=
        0.45 *
        Math.min(1, (relativeVolume - thresholds.participation) / thresholds.participation + 0.5);
      reasons.push(
        reason(
          'sessionVolume',
          'Session participation elevated',
          `${relativeVolume.toFixed(2)}× the volume this symbol normally has by now`,
          'volume',
        ),
      );
    } else if (relativeVolume < frame.config.volume.dryThreshold) {
      reasons.push(
        reason(
          'sessionVolumeDry',
          'Session participation thin',
          `${relativeVolume.toFixed(2)}× normal — the move has little behind it`,
          'volume',
          'opposing',
        ),
      );
    }
  }

  if (barRelativeVolume !== null) {
    if (barRelativeVolume >= thresholds.spike && barAgrees) {
      score += 0.55 * Math.min(1, (barRelativeVolume - thresholds.spike) / thresholds.spike + 0.6);
      reasons.push(
        reason(
          'volumeSpike',
          'Volume spike on the trigger bar',
          `${barRelativeVolume.toFixed(2)}× the volume this slot normally carries`,
          'volume',
        ),
      );
    } else if (barRelativeVolume >= thresholds.participation && barAgrees) {
      score += 0.3;
      reasons.push(
        reason(
          'volumeExpansion',
          'Volume expanding into the move',
          `${barRelativeVolume.toFixed(2)}× the normal volume for this slot`,
          'volume',
        ),
      );
    } else if (barRelativeVolume >= thresholds.spike && !barAgrees) {
      reasons.push(
        reason(
          'volumeAgainst',
          'Heavy volume against the setup',
          `${barRelativeVolume.toFixed(2)}× normal, on a bar closing the other way`,
          'volume',
          'opposing',
        ),
      );
    }
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}
