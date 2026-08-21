/**
 * Strategy configuration.
 *
 * Weights live in data, not in code, so the strategy can be changed without
 * touching the engine — and so a change can be versioned (CLAUDE.md hard
 * rule 7) rather than silently altering the meaning of past signals.
 */

export interface SignalWeights {
  readonly aboveEma20: number;
  readonly aboveEma50: number;
  readonly aboveEma200: number;
  readonly emaAlignment: number;
  readonly rsiMomentum: number;
  readonly macdHistogram: number;
  readonly macdCrossover: number;
  readonly volumeConfirmation: number;
  readonly structure: number;
}

export interface StrategyConfig {
  readonly weights: SignalWeights;
  readonly rsiPeriod: number;
  readonly emaFast: number;
  readonly emaMedium: number;
  readonly emaSlow: number;
  readonly macd: { readonly fast: number; readonly slow: number; readonly signal: number };
  readonly atrPeriod: number;
  /** Bars used to compute the average volume that relative volume compares to. */
  readonly volumeLookback: number;
  /** Bars used for higher-high / lower-low structure detection. */
  readonly structureLookback: number;
  /** RSI band treated as healthy bullish momentum. */
  readonly rsiBullish: { readonly min: number; readonly max: number };
  /** RSI above this is overbought — momentum, but stretched. */
  readonly rsiOverbought: number;
  readonly rsiOversold: number;
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  weights: {
    aboveEma20: 1,
    aboveEma50: 1,
    aboveEma200: 0.75,
    emaAlignment: 1.25,
    rsiMomentum: 1,
    macdHistogram: 1,
    macdCrossover: 1.5,
    volumeConfirmation: 0.75,
    structure: 1,
  },
  rsiPeriod: 14,
  emaFast: 20,
  emaMedium: 50,
  emaSlow: 200,
  macd: { fast: 12, slow: 26, signal: 9 },
  atrPeriod: 14,
  volumeLookback: 20,
  structureLookback: 10,
  rsiBullish: { min: 50, max: 70 },
  rsiOverbought: 70,
  rsiOversold: 30,
};
