/**
 * Daily Market Brief wire + input types.
 *
 * Same contract as the rest of the wire layer (see `watchlist-types.ts`):
 * every price is an integer PAISE value (CLAUDE.md hard rule 3), every instant
 * is an ISO-8601 string, every trading date is a `YYYY-MM-DD` IST key, and
 * `null` means "not available", never zero.
 *
 * The brief is a READ MODEL: it is assembled from data the worker already
 * persisted (`daily_indicators`, `signals`, `signal_factors`, `daily_candles`)
 * and the signed-in user's watchlists. Nothing here is recomputed from a
 * forming candle or from a live provider call, and no field is a probability,
 * a prediction, or an order.
 */

import type { SignalDirection } from '@/lib/dashboard-types';

/** The five directions a stored signal can carry, reused verbatim. */
export type BriefDirection = SignalDirection;

/** How complete/fresh the underlying session data is. */
export type BriefStatus = 'complete' | 'partial' | 'stale' | 'unavailable';

/** The deterministic breadth classification of the session. */
export type MarketConditionLabel =
  | 'bullish'
  | 'bearish'
  | 'mixed'
  | 'transitional'
  | 'insufficient_data';

/** Categorical prioritisation — never a probability of profit. */
export type AttentionLevel = 'high' | 'medium' | 'monitor';

/** A named "what changed" event type, closed set. */
export type ChangeEventType =
  | 'new_bullish_setup'
  | 'new_bearish_setup'
  | 'bullish_invalidated'
  | 'bearish_invalidated'
  | 'crossed_above_ma20'
  | 'crossed_below_ma20'
  | 'crossed_above_ma50'
  | 'crossed_below_ma50'
  | 'momentum_strengthened'
  | 'momentum_weakened'
  | 'unusual_volume'
  | 'breakout_appeared'
  | 'breakdown_appeared';

/** One stored factor line behind a signal (from `signal_factors`, verbatim). */
export interface BriefSignalFactor {
  readonly key: string;
  readonly label: string;
  /** −1 (bearish) … +1 (bullish). 0 means the factor was evaluated and did nothing. */
  readonly score: number;
  readonly weight: number;
  readonly detail: string;
}

/** A membership pointer — which of the user's watchlists holds an instrument. */
export interface BriefWatchlistRef {
  readonly watchlistId: number;
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Inputs to the pure builder
// ---------------------------------------------------------------------------

/** Everything known about one universe instrument for a single session. */
export interface SessionInstrumentFacts {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly sector: string | null;
  /** Session close, paise. */
  readonly close: number;
  /** Previous-close-based change for the session, percent. Null when unknown. */
  readonly changePercent: number | null;
  readonly sma20: number | null;
  readonly sma50: number | null;
  readonly rsi14: number | null;
  readonly macdHistogram: number | null;
  readonly relativeVolume: number | null;
  /** Bars available when the indicator row was computed — the coverage audit. */
  readonly barCount: number;
}

/** The stored signal verdict for one instrument on a session. */
export interface SessionSignalFacts {
  readonly signalId: number;
  readonly direction: BriefDirection;
  /** 0–100, 50 neutral. Explained entirely by `factors`. */
  readonly strength: number;
  readonly setups: readonly string[];
  readonly close: number;
  readonly factors: readonly BriefSignalFactor[];
}

/** The whole input to {@link buildMarketBrief}. Deterministic; no clock inside. */
export interface MarketBriefInput {
  /** The latest completed session, `YYYY-MM-DD` IST. */
  readonly sessionDate: string;
  /** The session immediately before it, or null when only one exists. */
  readonly previousSessionDate: string | null;
  /** Max `computed_at` across the session's indicators, ISO UTC. Null when none. */
  readonly completedAt: string | null;
  /** The clock, supplied by the caller so the builder stays pure. */
  readonly now: Date;

  /** Universe size expected for the session (constituent count from config). */
  readonly expectedInstruments: number;

  /** Per-instrument facts for the latest session, keyed by instrument id. */
  readonly current: ReadonlyMap<number, SessionInstrumentFacts>;
  /** Per-instrument facts for the previous session. Empty when none. */
  readonly previous: ReadonlyMap<number, SessionInstrumentFacts>;
  /** Stored signals for the latest session. */
  readonly currentSignals: ReadonlyMap<number, SessionSignalFacts>;
  /** Stored signals for the previous session. */
  readonly previousSignals: ReadonlyMap<number, SessionSignalFacts>;

  /** Which of the user's watchlists hold each instrument. */
  readonly watchlistMembership: ReadonlyMap<number, readonly BriefWatchlistRef[]>;
  /** True when the user has at least one watchlist. */
  readonly hasWatchlists: boolean;

  /** Benchmark index return for the session, percent. Null when unavailable. */
  readonly indexReturnPercent: number | null;
  readonly indexName: string | null;
}

// ---------------------------------------------------------------------------
// The output DTO
// ---------------------------------------------------------------------------

export interface BriefSessionMeta {
  readonly sessionDate: string;
  readonly previousSessionDate: string | null;
  readonly completedAt: string | null;
  readonly status: BriefStatus;
  readonly availableInstruments: number;
  readonly expectedInstruments: number;
  /**
   * How many completed sessions the data is behind what "now" would expect.
   * 0 = current, 1 = one expected session late, etc. Drives the stale banner.
   */
  readonly sessionsBehind: number;
}

export interface MarketConditionFactor {
  readonly id: string;
  readonly label: string;
  readonly value: number | string;
  readonly availableCount?: number;
  readonly totalCount?: number;
}

export interface MarketConditionDto {
  readonly label: MarketConditionLabel;
  readonly explanation: string;
  readonly factors: readonly MarketConditionFactor[];
}

export interface OverviewDto {
  readonly indexName: string | null;
  readonly indexReturnPercent: number | null;
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  /** Instruments with a usable direction (advance/decline/unchanged) this session. */
  readonly directionCovered: number;
  readonly above20DayAverage: number | null;
  readonly above20DayTotal: number | null;
  readonly above50DayAverage: number | null;
  readonly above50DayTotal: number | null;
  readonly newBullishSetups: number;
  readonly newBearishSetups: number;
}

export interface ChangeEventDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly eventType: ChangeEventType;
  readonly direction: 'bullish' | 'bearish' | 'neutral' | null;
  readonly explanation: string;
  readonly closePaise: number;
  readonly sessionReturn: number | null;
  readonly watchlists: readonly BriefWatchlistRef[];
}

export interface AttentionFactorDto {
  readonly id: string;
  readonly label: string;
  /** Points this factor added to the attention total. Always shown. */
  readonly contribution: number;
  readonly explanation: string;
}

export interface AttentionItemDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly level: AttentionLevel;
  /** The integer attention total — every point is accounted for in `factors`. */
  readonly score: number;
  readonly direction: BriefDirection | null;
  readonly closePaise: number;
  readonly sessionReturn: number | null;
  /** Deterministic attention factors (computed here). */
  readonly factors: readonly AttentionFactorDto[];
  /** Persisted signal factors (from `signal_factors`), for the "Why?" panel. */
  readonly signalFactors: readonly BriefSignalFactor[];
  readonly watchlists: readonly BriefWatchlistRef[];
}

export interface WatchlistBriefItemDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly eventType: ChangeEventType;
  readonly direction: 'bullish' | 'bearish' | 'neutral' | null;
  readonly explanation: string;
  readonly closePaise: number;
  readonly sessionReturn: number | null;
  readonly watchlists: readonly BriefWatchlistRef[];
}

export interface WatchlistBriefDto {
  readonly hasWatchlists: boolean;
  readonly watchedCount: number;
  readonly affectedCount: number;
  readonly newBullishCount: number;
  readonly newBearishCount: number;
  readonly strengthenedCount: number;
  readonly invalidatedCount: number;
  readonly transitionCount: number;
  readonly items: readonly WatchlistBriefItemDto[];
}

export interface SetupRowDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly direction: BriefDirection | null;
  readonly closePaise: number;
  readonly sessionReturn: number | null;
  readonly strength: number | null;
  readonly relativeVolume: number | null;
  readonly explanation: string;
  readonly signalFactors: readonly BriefSignalFactor[];
  readonly watchlists: readonly BriefWatchlistRef[];
}

export interface SetupListsDto {
  readonly bullish: readonly SetupRowDto[];
  readonly bearish: readonly SetupRowDto[];
  readonly breakout: readonly SetupRowDto[];
  readonly breakdown: readonly SetupRowDto[];
  readonly unusualVolume: readonly SetupRowDto[];
}

export interface DailyMarketBrief {
  readonly session: BriefSessionMeta;
  /** One deterministic headline sentence. */
  readonly headline: string;
  readonly marketCondition: MarketConditionDto;
  readonly overview: OverviewDto;
  readonly changes: readonly ChangeEventDto[];
  readonly attention: readonly AttentionItemDto[];
  readonly watchlists: WatchlistBriefDto;
  readonly setups: SetupListsDto;
  readonly disclaimer: string;
}
