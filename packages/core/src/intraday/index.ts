/**
 * Intraday signal engine.
 *
 * Pure throughout — bars and a timestamp in, scored setups out (CLAUDE.md hard
 * rule 1). The worker supplies data and stores results; the backtester will
 * supply historical data and score outcomes. Both run this same code.
 */

export type { BucketOptions } from './bars.js';
export {
  BUCKET_ORIGIN_MINUTES,
  bucketBars,
  bucketStart,
  countMissingMinutes,
  groupBySession,
  isCoherent,
  openingRange,
  sessionBars,
  sessionSlot,
  stalenessMinutes,
} from './bars.js';
export type { IntradayConfig, RegimeProfile, ScoreWeights } from './config.js';
export { DEFAULT_INTRADAY_CONFIG, qualityFor, totalWeight } from './config.js';
export type { ContextInput } from './context.js';
export { buildMarketContext, emptyMarketContext } from './context.js';
export type { IntradayEngineInput } from './engine.js';
export { evaluateIntraday } from './engine.js';
export type { EvaluationFrame, FrameInput, FrameResult } from './frame.js';
export { buildFrame } from './frame.js';
export type { LevelInputs } from './levels.js';
export {
  brokenAbove,
  brokenBelow,
  buildLevels,
  isAtLevel,
  nearestResistance,
  nearestSupport,
  trackBreak,
} from './levels.js';
export type {
  LiveSignal,
  SignalCreation,
  SignalEvent,
  SignalEventKind,
  SignalUpdate,
  TransitionInput,
  TransitionResult,
} from './lifecycle.js';
export { transition } from './lifecycle.js';
export type { PatternMatch } from './patterns.js';
export { bodyRatio, detectPatterns, patternBias } from './patterns.js';
export type { ScoredCandidate } from './scoring.js';
export { scoreEvidence } from './scoring.js';
export {
  canEmitNewSignal,
  minutesToClose,
  pastForceExit,
  REGIME_LABEL,
  regimeProfile,
  sessionRegime,
} from './session.js';
export type { Strategy } from './strategies/index.js';
export { STRATEGIES } from './strategies/index.js';
export type { RangeRead, StructureKind, StructureRead, SwingPoint } from './structure.js';
export { findSwings, gapPercent, priorRange, readRange, readStructure } from './structure.js';
export { alignmentScore, readTrend } from './trend.js';
export type {
  DataQuality,
  IntradayEvaluation,
  IntradaySnapshot,
  InvalidationRule,
  MarketContext,
  PriceLevel,
  Reason,
  ScoreArithmetic,
  ScoreCategory,
  ScoreComponent,
  SessionRegime,
  SignalCandidate,
  SignalKind,
  SignalQuality,
  SignalState,
  StrategyEvidence,
  SymbolBars,
  TechnicalLevels,
  TradeDirection,
  TrendRead,
} from './types.js';
export { LIVE_STATES, SCORE_CATEGORIES, TERMINAL_STATES } from './types.js';
export type { LiquidityVerdict, VolumeRead } from './volume.js';
export {
  assessLiquidity,
  buildVolumeProfile,
  expectedCumulative,
  expectedForBar,
  PROFILE_SLOTS,
  readVolume,
} from './volume.js';
