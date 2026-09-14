import type { Bar } from '@equitywise/core';

/**
 * F&O research types. This is a SEPARATE research strategy for derivatives,
 * not the deployed cash-equity signals product. It still honours the load-
 * bearing invariants: integer paise, closed candles only, and every signal
 * carries its factor breakdown.
 */

/** A 5-minute futures candle: a core Bar (integer paise) plus open interest. */
export interface FnoCandle extends Bar {
  readonly oi: number;
}

export type Direction = 'BULLISH' | 'BEARISH';

export interface FnoStrategyConfig {
  /** Instrument tick size in paise (SENSEX index 0.05 pts = 5 paise). */
  tickPaise: number;
  /** Bars to skip at session start while indicators warm up. */
  warmupBars: number;
  emaFast: number;
  emaSlow: number;
  atrPeriod: number;
  /** How close (in ATR multiples) the pullback must come to VWAP. */
  pullbackAtrMult: number;
  /** OI must be rising vs this many bars back (fresh position buildup). */
  oiLookback: number;
  /** Bar volume must be >= running average volume × this. */
  volumeMultiple: number;
  /** Bars after the setup within which the trigger must fire. */
  pendingWindowBars: number;
  /** Target multiples of R (risk = |trigger − invalidation|). */
  targetR: readonly [number, number];
}

export const DEFAULT_FNO_CONFIG: FnoStrategyConfig = {
  tickPaise: 5,
  warmupBars: 6,
  emaFast: 9,
  emaSlow: 21,
  atrPeriod: 14,
  pullbackAtrMult: 0.5,
  oiLookback: 3,
  volumeMultiple: 1,
  pendingWindowBars: 3,
  targetR: [1, 2],
};

export interface FnoFactors {
  vwap: number;
  distanceToVwapPaise: number;
  emaFast: number;
  emaSlow: number;
  atr: number;
  /** OI change vs `oiLookback` bars back (contracts). */
  oiChange: number;
  runningAvgVolume: number;
  barVolume: number;
}

/** A published setup ("Entry Pending"), all prices in integer paise. */
export interface FnoSetup {
  index: number;
  timestamp: number;
  direction: Direction;
  triggerLevel: number;
  invalidationLevel: number;
  target1: number;
  target2: number;
  riskPaise: number;
  factors: FnoFactors;
}
