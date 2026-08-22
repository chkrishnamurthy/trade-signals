import type { EvaluationFrame } from '../frame.js';
import type { StrategyEvidence } from '../types.js';
import { breakoutStrategy } from './breakout.js';
import { momentumStrategy } from './momentum.js';
import { reversalStrategy } from './reversal.js';
import { trendContinuationStrategy } from './trend-continuation.js';
import { vwapStrategy } from './vwap.js';

/**
 * The strategy registry.
 *
 * Each strategy reads one frame and returns structured evidence — never a
 * score, never a decision. Scoring is one layer up and is the same for every
 * strategy, so a new strategy cannot quietly grade itself generously.
 *
 * Order here is presentation order for ties only; the confluence engine ranks
 * by score.
 */
export type Strategy = (frame: EvaluationFrame) => StrategyEvidence[];

export const STRATEGIES: readonly Strategy[] = [
  breakoutStrategy,
  vwapStrategy,
  trendContinuationStrategy,
  momentumStrategy,
  reversalStrategy,
];

export { breakoutStrategy } from './breakout.js';
export { momentumStrategy } from './momentum.js';
export { reversalStrategy } from './reversal.js';
export {
  breakBuffer,
  proximity,
  reason,
  technicalLevels,
  volumeEvidence,
  volumeThresholds,
} from './shared.js';
export { trendContinuationStrategy } from './trend-continuation.js';
export { vwapStrategy } from './vwap.js';
