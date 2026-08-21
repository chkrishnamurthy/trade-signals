export type { SignalWeights, StrategyConfig } from './config.js';
export { DEFAULT_STRATEGY } from './config.js';
export type {
  IndicatorSnapshot,
  SignalDirection,
  SignalFactor,
  SignalReport,
} from './engine.js';
export { evaluateSignals } from './engine.js';
export type { SwingCandidate, SwingCriterion } from './swing.js';
export { SWING_MIN_CRITERIA, scanSwing } from './swing.js';
