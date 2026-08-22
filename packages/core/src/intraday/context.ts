import { vwap as computeVwap } from '../indicators/index.js';
import type { Bar } from '../types.js';
import { latest } from '../types.js';
import { bucketBars, sessionBars } from './bars.js';
import type { IntradayConfig } from './config.js';
import { readTrend } from './trend.js';
import type { MarketContext } from './types.js';

/**
 * Market and sector context.
 *
 * A stock is not an island: the same breakout is a different proposition when
 * the index is up 0.6% on strong breadth than when it is down 0.8% with VIX
 * rising. This module turns "what is the rest of the market doing" into a
 * single signed number, `longSupport`, running −1 (hostile to a long) to +1
 * (supportive), which the scoring model reads and inverts for shorts.
 *
 * Every input is optional. Context that is unavailable contributes nothing
 * rather than defaulting to neutral-positive — an engine that treats "we could
 * not fetch the index" as "the index is fine" produces its most confident
 * signals exactly when it knows least.
 */

export interface ContextInput {
  readonly benchmarkSymbol: string;
  /** Today's 1m bars for the benchmark index. */
  readonly benchmarkMinuteBars: readonly Bar[];
  /** Prior daily bars for the benchmark, for the previous close. */
  readonly benchmarkDailyBars: readonly Bar[];
  /** Session change percent for the banking index, when available. */
  readonly bankNiftyChangePercent: number | null;
  /** Advancing symbols ÷ total, 0-1, across the analysed universe. */
  readonly breadth: number | null;
  readonly sector: string | null;
  /** Mean session change percent across the symbol's sector. */
  readonly sectorChangePercent: number | null;
  /** India VIX level and its previous close, for direction. */
  readonly volatilityIndex: number | null;
  readonly volatilityPreviousClose: number | null;
  readonly at: Date;
}

/** Weights for each contribution to `longSupport`. They sum to 1. */
const CONTRIBUTION = {
  trend: 0.3,
  change: 0.2,
  vwap: 0.15,
  breadth: 0.2,
  sector: 0.1,
  volatility: 0.05,
} as const;

export function buildMarketContext(input: ContextInput, config: IntradayConfig): MarketContext {
  const notes: string[] = [];
  let support = 0;
  let weight = 0;

  const contribute = (value: number, share: number, note: string): void => {
    support += Math.max(-1, Math.min(1, value)) * share;
    weight += share;
    notes.push(note);
  };

  // --- Benchmark trend and session move -----------------------------------
  const session = sessionBars(input.benchmarkMinuteBars, input.at);
  const trendBars = bucketBars(session, config.timeframes.trend, { now: input.at });
  const benchmarkTrend =
    trendBars.length > 0 ? readTrend(trendBars, config.timeframes.trend, config) : null;

  const previousClose = input.benchmarkDailyBars.at(-1)?.close ?? null;
  const lastClose = session.at(-1)?.close ?? null;
  const changePercent =
    previousClose === null || lastClose === null || previousClose === 0
      ? null
      : ((lastClose - previousClose) / previousClose) * 100;

  if (benchmarkTrend !== null && benchmarkTrend.direction !== 'flat') {
    const signed =
      benchmarkTrend.direction === 'long' ? benchmarkTrend.strength : -benchmarkTrend.strength;
    contribute(
      signed,
      CONTRIBUTION.trend,
      `${input.benchmarkSymbol} ${benchmarkTrend.direction === 'long' ? 'trending up' : 'trending down'} on the ${config.timeframes.trend}m`,
    );
  }

  if (changePercent !== null) {
    // Half a percent on an index is a decisive session; scale to that.
    contribute(
      changePercent / 0.5,
      CONTRIBUTION.change,
      `${input.benchmarkSymbol} ${changePercent >= 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(2)}%`,
    );
  }

  // --- Benchmark relative to its own VWAP ----------------------------------
  const benchmarkVwap = latest(computeVwap(session));
  const benchmarkAboveVwap =
    benchmarkVwap === null || lastClose === null ? null : lastClose > benchmarkVwap;
  if (benchmarkAboveVwap !== null) {
    contribute(
      benchmarkAboveVwap ? 1 : -1,
      CONTRIBUTION.vwap,
      `${input.benchmarkSymbol} ${benchmarkAboveVwap ? 'above' : 'below'} its VWAP`,
    );
  }

  // --- Breadth --------------------------------------------------------------
  if (input.breadth !== null) {
    contribute(
      (input.breadth - 0.5) * 2,
      CONTRIBUTION.breadth,
      `${Math.round(input.breadth * 100)}% of the universe advancing`,
    );
  }

  // --- Sector ---------------------------------------------------------------
  if (input.sectorChangePercent !== null && input.sector !== null) {
    contribute(
      input.sectorChangePercent / 0.8,
      CONTRIBUTION.sector,
      `${input.sector} ${input.sectorChangePercent >= 0 ? 'up' : 'down'} ${Math.abs(input.sectorChangePercent).toFixed(2)}%`,
    );
  }

  // --- Volatility -----------------------------------------------------------
  // A rising VIX is risk-off: it is a headwind for longs and a tailwind for
  // shorts, which is the opposite of how a naive "up is good" reading would
  // treat it.
  let volatilityRising: boolean | null = null;
  if (input.volatilityIndex !== null && input.volatilityPreviousClose !== null) {
    volatilityRising = input.volatilityIndex > input.volatilityPreviousClose;
    contribute(
      volatilityRising ? -1 : 0.5,
      CONTRIBUTION.volatility,
      `India VIX ${volatilityRising ? 'rising' : 'easing'} at ${input.volatilityIndex.toFixed(2)}`,
    );
  }

  return {
    benchmark: input.benchmarkSymbol,
    benchmarkTrend,
    benchmarkChangePercent: changePercent,
    benchmarkAboveVwap,
    bankNiftyChangePercent: input.bankNiftyChangePercent,
    breadth: input.breadth,
    sectorChangePercent: input.sectorChangePercent,
    sector: input.sector,
    volatilityIndex: input.volatilityIndex,
    volatilityRising,
    // Normalised by the weight actually used, so partial context is scaled
    // honestly rather than diluted toward zero by the inputs we do not have.
    longSupport: weight === 0 ? 0 : Math.max(-1, Math.min(1, support / weight)),
    notes,
  };
}

/** A context with nothing in it. Used when no index data could be fetched. */
export function emptyMarketContext(benchmark: string): MarketContext {
  return {
    benchmark,
    benchmarkTrend: null,
    benchmarkChangePercent: null,
    benchmarkAboveVwap: null,
    bankNiftyChangePercent: null,
    breadth: null,
    sectorChangePercent: null,
    sector: null,
    volatilityIndex: null,
    volatilityRising: null,
    longSupport: 0,
    notes: [],
  };
}
