import { DEFAULT_INTRADAY_CONFIG, type IntradayConfig } from './config.js';
import { buildFrame, type EvaluationFrame, type FrameInput } from './frame.js';
import { scoreEvidence } from './scoring.js';
import { canEmitNewSignal } from './session.js';
import { STRATEGIES } from './strategies/index.js';
import type { IntradayEvaluation, SignalCandidate } from './types.js';

/**
 * The intraday signal engine.
 *
 * Bars and market context in, scored candidates out. Pure: no clock, no
 * network, no mutable module state (CLAUDE.md hard rule 1), which is what
 * lets the live worker and a backtest run this exact function.
 *
 * The pipeline, in order, with the gates first:
 *
 *   frame        → measure everything once
 *   gates        → data quality, liquidity, session timing
 *   strategies   → structured evidence, no scores
 *   confluence   → one scoring model for all of them
 *   filter       → risk/reward, score floor
 *   rank         → strongest first
 *
 * Gates come before strategies deliberately. Scoring a symbol whose feed has a
 * hole in it produces a confident number derived from data that is not there,
 * and it is much easier to justify not looking than to explain afterwards why
 * a signal fired on four missing candles.
 */

export type IntradayEngineInput = FrameInput;

export function evaluateIntraday(
  input: IntradayEngineInput,
  config: IntradayConfig = DEFAULT_INTRADAY_CONFIG,
): IntradayEvaluation {
  const built = buildFrame(input, config);

  if (!built.ok) {
    return {
      symbol: input.symbol,
      evaluatedAt: input.at.getTime(),
      regime: built.regime,
      snapshot: emptySnapshot(input.at),
      dataQuality: built.dataQuality,
      candidates: [],
      rejections: built.dataQuality.issues,
    };
  }

  const { frame } = built;
  const rejections: string[] = [];

  // --- Gates ---------------------------------------------------------------
  if (!frame.dataQuality.usable) {
    return finish(
      frame,
      [],
      [...frame.dataQuality.issues, 'Data quality is not sufficient to evaluate'],
    );
  }
  if (!frame.liquidity.eligible) {
    return finish(frame, [], frame.liquidity.reasons);
  }

  // --- Strategies ----------------------------------------------------------
  const candidates: SignalCandidate[] = [];
  for (const strategy of STRATEGIES) {
    for (const evidence of strategy(frame)) {
      const scored = scoreEvidence(frame, evidence);
      if (scored.candidate !== null) candidates.push(scored.candidate);
      else if (scored.rejection !== null) rejections.push(scored.rejection);
    }
  }

  // --- Session timing ------------------------------------------------------
  // Applied AFTER scoring rather than before, so the rejection can say what
  // was found and why it is not being surfaced, rather than silently nothing.
  const timing = canEmitNewSignal(input.at, config);
  if (!timing.allowed) {
    const found = candidates.length === 0 ? '' : ` (${candidates.length} setup(s) suppressed)`;
    return finish(frame, [], [...rejections, `${timing.reason ?? 'Outside signal hours'}${found}`]);
  }

  // --- Rank ---------------------------------------------------------------
  // Triggered setups outrank forming ones at equal score: a setup that has
  // actually done the thing is worth more than one that might.
  const ranked = [...candidates].sort(
    (a, b) => Number(b.triggered) - Number(a.triggered) || b.score - a.score,
  );

  return finish(frame, dropWeakerDuplicates(ranked, config), rejections);
}

/**
 * Keeps the strongest candidate per direction, plus a limited number overall.
 *
 * Without this a single decisive bar produces a breakout, a momentum signal
 * and a trend continuation for the same symbol at the same moment — three
 * cards describing one event. They are not independent confirmations of each
 * other; they are three views of the same bar.
 */
function dropWeakerDuplicates(
  candidates: readonly SignalCandidate[],
  config: IntradayConfig,
): SignalCandidate[] {
  const kept: SignalCandidate[] = [];
  const seenDirections = new Set<string>();

  for (const candidate of candidates) {
    if (seenDirections.has(candidate.direction)) continue;
    seenDirections.add(candidate.direction);
    kept.push(candidate);
    if (kept.length >= config.lifecycle.maxLiveSignalsPerSymbol) break;
  }
  return kept;
}

function finish(
  frame: EvaluationFrame,
  candidates: readonly SignalCandidate[],
  rejections: readonly string[],
): IntradayEvaluation {
  return {
    symbol: frame.symbol,
    evaluatedAt: frame.at.getTime(),
    regime: frame.regime,
    snapshot: frame.snapshot,
    dataQuality: frame.dataQuality,
    candidates,
    rejections,
  };
}

/** Placeholder snapshot for an evaluation that never got off the ground. */
function emptySnapshot(at: Date): IntradayEvaluation['snapshot'] {
  return {
    price: 0,
    lastBarAt: at.getTime(),
    lastBarHigh: 0,
    lastBarLow: 0,
    dayOpen: null,
    dayHigh: null,
    dayLow: null,
    previousClose: null,
    previousHigh: null,
    previousLow: null,
    openingRangeHigh: null,
    openingRangeLow: null,
    vwap: null,
    vwapSlopePercent: null,
    vwapDistancePercent: null,
    ema9: null,
    ema20: null,
    ema50: null,
    rsi: null,
    macdHistogram: null,
    adx: null,
    plusDi: null,
    minusDi: null,
    atr: null,
    atrPercent: null,
    rocFast: null,
    rocSlow: null,
    relativeVolume: null,
    barRelativeVolume: null,
    sessionVolume: 0,
    gapPercent: null,
    changePercent: null,
    trends: [],
    levels: [],
  };
}

export type { EvaluationFrame } from './frame.js';
export { buildFrame } from './frame.js';
