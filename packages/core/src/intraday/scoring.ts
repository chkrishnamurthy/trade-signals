import { qualityFor, totalWeight } from './config.js';
import type { EvaluationFrame } from './frame.js';
import { patternBias } from './patterns.js';
import { regimeProfile } from './session.js';
import { volumeEvidence } from './strategies/shared.js';
import { alignmentScore } from './trend.js';
import type {
  Reason,
  ScoreCategory,
  ScoreComponent,
  SignalCandidate,
  StrategyEvidence,
  TradeDirection,
} from './types.js';

/**
 * The confluence engine.
 *
 * Every strategy's evidence is scored by THIS code, not by the strategy, so
 * no strategy can grade itself generously. Each of the eight categories is
 * measured independently from the frame, and the strategy's own reasons then
 * adjust its category by a bounded amount.
 *
 * Independence is the entire point. Eight categories that all restate "price
 * went up" would produce a 95 for a single moving average crossing. The
 * categories here are chosen so that a high total requires several genuinely
 * different kinds of agreement: structure, participation, session reference,
 * the wider market, and the shape of the day's volatility.
 *
 * The number produced is TECHNICAL SETUP STRENGTH. It is not a probability, it
 * is not an expected return, and nothing in this file has any information from
 * which either could be derived.
 */

/** How much one supporting or opposing reason may move its category. */
const REASON_SUPPORT = 0.1;
const REASON_OPPOSE = 0.18;
/** Total adjustment reasons may contribute, either way. */
const REASON_CAP = 0.3;

const CATEGORY_LABEL: Record<ScoreCategory, string> = {
  trend: 'Trend',
  priceAction: 'Price action',
  momentum: 'Momentum',
  volume: 'Volume',
  vwap: 'VWAP',
  marketContext: 'Market context',
  volatility: 'Volatility',
  multiTimeframe: 'Multi-timeframe',
};

export interface ScoredCandidate {
  readonly candidate: SignalCandidate | null;
  /** Why it did not qualify, when it did not. */
  readonly rejection: string | null;
}

/**
 * Scores one strategy's evidence.
 *
 * Returns a rejection rather than a low score for the disqualifying cases —
 * an unacceptable risk/reward structure, or a score below the surfacing floor
 * — because those are not weak signals, they are non-signals.
 */
export function scoreEvidence(frame: EvaluationFrame, evidence: StrategyEvidence): ScoredCandidate {
  const { config } = frame;
  const { direction } = evidence;

  if (evidence.levels === null) {
    return {
      candidate: null,
      rejection: `${evidence.strategy}: no volatility estimate for levels`,
    };
  }

  const levels = evidence.levels;
  const riskReward = levels.riskReward;
  if (riskReward === null || riskReward < config.targets.minRiskReward) {
    return {
      candidate: null,
      rejection: `${evidence.strategy}: reward-to-risk ${riskReward?.toFixed(2) ?? '—'} is below the ${config.targets.minRiskReward} floor`,
    };
  }

  // The target must clear transaction costs by a wide enough margin that the
  // trade is worth taking at all. Checked before the ratio because a target
  // this close makes the ratio meaningless rather than merely unattractive.
  const entry = Math.round((levels.entryLow + levels.entryHigh) / 2);
  const targetPercent = entry <= 0 ? 0 : (levels.reward / entry) * 100;
  if (targetPercent < config.targets.minTargetPercent) {
    return {
      candidate: null,
      rejection: `${evidence.strategy}: target 1 is only ${targetPercent.toFixed(2)}% away, below the ${config.targets.minTargetPercent}% floor — transaction costs would consume it`,
    };
  }

  const netRiskReward = levels.netRiskReward;
  if (netRiskReward === null || netRiskReward < config.targets.minNetRiskReward) {
    return {
      candidate: null,
      rejection: `${evidence.strategy}: reward-to-risk net of costs is ${netRiskReward?.toFixed(2) ?? 'negative'}, below the ${config.targets.minNetRiskReward} floor`,
    };
  }

  const byCategory = groupReasons(evidence.reasons);
  const bases = categoryBases(frame, direction);

  const components: ScoreComponent[] = [];
  for (const category of Object.keys(bases) as ScoreCategory[]) {
    const base = bases[category];
    const adjusted = applyReasons(base.score, byCategory.get(category) ?? []);
    const weight = config.weights[category];
    components.push({
      category,
      label: CATEGORY_LABEL[category],
      score: adjusted,
      weight,
      points: adjusted * weight,
      detail: base.detail,
    });
  }

  const maximum = totalWeight(config.weights);
  const raw = components.reduce((sum, component) => sum + component.points, 0);
  const normalised = maximum === 0 ? 0 : (raw / maximum) * 100;

  // Conviction scales the result rather than adding to it: a setup whose own
  // preconditions are half met should not reach the same score as one whose
  // are fully met, however good the surrounding context looks.
  const convicted = normalised * (0.65 + 0.35 * evidence.conviction);

  // Regimes with a worse base rate carry a flat penalty, so the same technical
  // picture needs to be better to surface at 11:45 than at 10:15.
  const penalty = regimeProfile(frame.regime, config).scorePenalty;
  const score = Math.max(0, Math.min(100, Math.round(convicted - penalty)));

  const quality = qualityFor(score, config);
  if (quality === null) {
    return {
      candidate: null,
      rejection: `${evidence.strategy}: scored ${score}, below the ${config.minScore} floor`,
    };
  }

  return {
    candidate: {
      kind: evidence.kind,
      direction,
      strategy: evidence.strategy,
      score,
      quality,
      triggered: evidence.triggered,
      components,
      scoring: {
        categoryPoints: raw,
        maxPoints: maximum,
        conviction: evidence.conviction,
        regimePenalty: penalty,
        score,
      },
      reasons: evidence.reasons,
      invalidations: evidence.invalidations,
      levels: evidence.levels,
      triggerMinutes: evidence.triggerMinutes,
      setupMinutes: evidence.setupMinutes,
      trendMinutes: evidence.trendMinutes,
      setupKey: `${evidence.kind}|${evidence.anchor}`,
    },
    rejection: null,
  };
}

function groupReasons(reasons: readonly Reason[]): Map<ScoreCategory, Reason[]> {
  const grouped = new Map<ScoreCategory, Reason[]>();
  for (const item of reasons) {
    const bucket = grouped.get(item.category);
    if (bucket === undefined) grouped.set(item.category, [item]);
    else bucket.push(item);
  }
  return grouped;
}

/**
 * Applies a category's reasons to its base score, within a bound.
 *
 * Bounded so that listing six supporting reasons cannot manufacture a full
 * category out of a base of zero. Reasons refine a measurement; they do not
 * replace it.
 */
function applyReasons(base: number, reasons: readonly Reason[]): number {
  let adjustment = 0;
  for (const item of reasons) {
    if (item.polarity === 'supporting') adjustment += REASON_SUPPORT;
    else if (item.polarity === 'opposing') adjustment -= REASON_OPPOSE;
  }
  const bounded = Math.max(-REASON_CAP, Math.min(REASON_CAP, adjustment));
  return Math.max(0, Math.min(1, base + bounded));
}

interface Base {
  readonly score: number;
  readonly detail: string;
}

/** Each category, measured from the frame alone. */
function categoryBases(
  frame: EvaluationFrame,
  direction: TradeDirection,
): Record<ScoreCategory, Base> {
  return {
    trend: trendBase(frame, direction),
    priceAction: priceActionBase(frame, direction),
    momentum: momentumBase(frame, direction),
    volume: volumeBase(frame, direction),
    vwap: vwapBase(frame, direction),
    marketContext: marketBase(frame, direction),
    volatility: volatilityBase(frame),
    multiTimeframe: multiTimeframeBase(frame, direction),
  };
}

function trendBase(frame: EvaluationFrame, direction: TradeDirection): Base {
  const read = frame.snapshot.trends.find((t) => t.minutes === frame.config.timeframes.trend);
  if (read === undefined) return { score: 0.3, detail: 'Higher timeframe trend unavailable' };
  if (read.direction === direction) {
    return { score: Math.max(0.4, read.strength), detail: read.detail };
  }
  if (read.direction === 'flat') {
    return { score: 0.35, detail: `No clear ${read.minutes}m trend — ${read.detail}` };
  }
  // Counter-trend is not zero: a reversal at a major level legitimately fights
  // the trend. It is heavily discounted, and the stronger the trend, the more.
  return {
    score: Math.max(0, 0.3 - read.strength * 0.3),
    detail: `Against the trend — ${read.detail}`,
  };
}

function priceActionBase(frame: EvaluationFrame, direction: TradeDirection): Base {
  const wanted = direction === 'long' ? 1 : -1;
  const structure = frame.structure;
  const structureAgreement = Math.max(0, Math.min(1, (structure.bias * wanted + 1) / 2));

  const bias = patternBias(frame.patterns);
  const patternAgreement = Math.max(0, Math.min(1, (bias * wanted + 1) / 2));

  const score = structureAgreement * 0.6 + patternAgreement * 0.4;
  const patternNames = frame.patterns.map((p) => p.label).join(', ');
  return {
    score,
    detail: patternNames === '' ? structure.detail : `${structure.detail}; ${patternNames}`,
  };
}

function momentumBase(frame: EvaluationFrame, direction: TradeDirection): Base {
  const { rsi, macdHistogram, rocFast, rocSlow, adx } = frame.snapshot;
  const { config } = frame;
  const long = direction === 'long';
  const parts: string[] = [];
  let score = 0;
  let counted = 0;

  if (rsi !== null) {
    counted += 1;
    const band = long ? config.rsi.bullBand : config.rsi.bearBand;
    const inBand = long ? rsi >= band.min && rsi <= band.max : rsi >= band.min && rsi <= band.max;
    const stretched = long ? rsi > config.rsi.overbought : rsi < config.rsi.oversold;
    // Stretched still scores: strong trends run overbought for hours. It just
    // scores less than a clean, sustainable reading.
    score += inBand ? 1 : stretched ? 0.55 : 0.15;
    parts.push(`RSI ${rsi.toFixed(1)}`);
  }

  if (macdHistogram !== null) {
    counted += 1;
    score += (long ? macdHistogram > 0 : macdHistogram < 0) ? 1 : 0;
    parts.push(`MACD histogram ${macdHistogram > 0 ? 'positive' : 'negative'}`);
  }

  if (rocFast !== null && rocSlow !== null) {
    counted += 1;
    const accelerating = long ? rocFast > rocSlow : rocFast < rocSlow;
    const agrees = long ? rocFast > 0 : rocFast < 0;
    score += agrees ? (accelerating ? 1 : 0.6) : 0;
    parts.push(`ROC ${rocFast.toFixed(2)}%`);
  }

  if (adx !== null) {
    counted += 1;
    score += Math.max(
      0,
      Math.min(1, (adx - config.volatility.choppyAdx) / (config.volatility.trendingAdx * 1.5)),
    );
    parts.push(`ADX ${adx.toFixed(0)}`);
  }

  return {
    score: counted === 0 ? 0 : score / counted,
    detail: parts.length === 0 ? 'Momentum indicators have not warmed up' : parts.join(' · '),
  };
}

function volumeBase(frame: EvaluationFrame, direction: TradeDirection): Base {
  const { score, reasons } = volumeEvidence(frame, direction);
  const relative = frame.volume.relativeVolume;
  return {
    score,
    detail:
      relative === null
        ? (reasons[0]?.detail ?? 'No volume profile available')
        : `${relative.toFixed(2)}× normal participation for this time of day`,
  };
}

function vwapBase(frame: EvaluationFrame, direction: TradeDirection): Base {
  const { vwap: value, vwapSlopePercent: slope, vwapDistancePercent: distance } = frame.snapshot;
  if (value === null) return { score: 0.3, detail: 'VWAP unavailable' };

  const long = direction === 'long';
  const rightSide = distance !== null && (long ? distance > 0 : distance < 0);
  const slopeAgrees = slope === null ? null : long ? slope > 0 : slope < 0;

  let score = rightSide ? 0.55 : 0.1;
  if (slopeAgrees === true) score += 0.3;
  else if (slopeAgrees === false) score -= 0.1;

  // Extension: price a very long way from VWAP is more likely to revert to it
  // than to keep running, so distance beyond a couple of ATR is a discount,
  // not a bonus, however right the direction is.
  const atr = frame.atrValue;
  if (atr !== null && atr > 0) {
    const inAtr = Math.abs(frame.snapshot.price - value) / atr;
    if (inAtr > 3) score -= 0.25;
    else if (inAtr > 2) score -= 0.1;
    else score += 0.15;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    detail: `${distance === null ? '—' : `${distance.toFixed(2)}%`} from VWAP, slope ${slope === null ? '—' : `${slope.toFixed(3)}%`}`,
  };
}

function marketBase(frame: EvaluationFrame, direction: TradeDirection): Base {
  const support = direction === 'long' ? frame.context.longSupport : -frame.context.longSupport;
  const notes = frame.context.notes.join('; ');
  return {
    score: Math.max(0, Math.min(1, (support + 1) / 2)),
    detail: notes === '' ? 'No market context available' : notes,
  };
}

function volatilityBase(frame: EvaluationFrame): Base {
  const atrPercent = frame.snapshot.atrPercent;
  const { minAtrPercent, maxAtrPercent } = frame.config.volatility;
  if (atrPercent === null) return { score: 0.3, detail: 'ATR has not warmed up' };

  let score: number;
  let detail: string;
  if (atrPercent < minAtrPercent) {
    // Too quiet: the setup has nowhere to travel before the session ends.
    score = 0.15;
    detail = `ATR ${atrPercent.toFixed(2)}% of price — too tight to reach a target`;
  } else if (atrPercent > maxAtrPercent) {
    // Too wild: stops that survive the noise are too far to be worth it.
    score = 0.2;
    detail = `ATR ${atrPercent.toFixed(2)}% of price — disorderly`;
  } else {
    const midpoint = (minAtrPercent + maxAtrPercent) / 2;
    const spread = (maxAtrPercent - minAtrPercent) / 2;
    score = Math.max(0.5, 1 - Math.abs(atrPercent - midpoint) / spread);
    detail = `ATR ${atrPercent.toFixed(2)}% of price — workable range`;
  }

  const range = frame.range;
  if (range?.expanding === true) score = Math.min(1, score + 0.15);
  return { score, detail };
}

function multiTimeframeBase(frame: EvaluationFrame, direction: TradeDirection): Base {
  const score = alignmentScore(frame.snapshot.trends, direction);
  const detail = frame.snapshot.trends
    .map((trend) => `${trend.minutes}m ${trend.direction}`)
    .join(' · ');
  return { score, detail };
}
