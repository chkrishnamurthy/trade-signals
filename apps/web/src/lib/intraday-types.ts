import type { MarketStateDto } from './market-types';

/**
 * Intraday trade-signal wire types.
 *
 * All prices are integer PAISE (CLAUDE.md hard rule 3); every instant is an
 * ISO-8601 string in UTC (hard rule 6). `null` means the value was not
 * available, never zero.
 *
 * The browser sees our symbols (`RELIANCE`) and our vocabulary. No provider
 * name, symbol format or status code crosses this boundary.
 *
 * These describe TECHNICAL SETUPS and the evidence behind them. There is no
 * quantity, no order id, and no field an order could be built from.
 */

/** Which side the structure favours. Rendered as BUY / SELL. */
export type TradeDirection = 'long' | 'short';

export type IntradaySignalKind =
  | 'breakout'
  | 'breakdown'
  | 'vwap_reclaim'
  | 'vwap_breakdown'
  | 'momentum_long'
  | 'momentum_short'
  | 'trend_continuation_long'
  | 'trend_continuation_short'
  | 'reversal_long'
  | 'reversal_short';

export type IntradaySignalState =
  | 'watching'
  | 'forming'
  | 'triggered'
  | 'confirmed'
  | 'active'
  | 'invalidated'
  | 'expired'
  | 'target_met';

export type SignalQuality = 'exceptional' | 'strong' | 'good' | 'watch';

export type ScoreCategory =
  | 'trend'
  | 'priceAction'
  | 'momentum'
  | 'volume'
  | 'vwap'
  | 'marketContext'
  | 'volatility'
  | 'multiTimeframe';

export interface IntradayFactorDto {
  readonly category: ScoreCategory;
  readonly label: string;
  /** 0-1 within the category. */
  readonly score: number;
  /** Points the category could contribute. */
  readonly weight: number;
  /** score × weight. */
  readonly points: number;
  readonly detail: string;
}

/**
 * The arithmetic behind a score.
 *
 * The category points do not sum to the published score — conviction scales
 * the total and the session regime deducts a flat penalty. Every term is here
 * so the breakdown genuinely adds up on screen.
 */
export interface ScoreArithmeticDto {
  readonly categoryPoints: number;
  readonly maxPoints: number;
  readonly conviction: number;
  readonly regimePenalty: number;
  readonly score: number;
}

export interface IntradayReasonDto {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly category: ScoreCategory;
  readonly polarity: 'supporting' | 'opposing' | 'context';
}

export interface IntradayEventDto {
  readonly at: string;
  readonly kind: string;
  readonly message: string;
  readonly detail: string | null;
  readonly score: number;
  readonly state: IntradaySignalState;
}

/** Technical price levels. Chart prices in paise — never an order. */
export interface TechnicalLevelsDto {
  readonly entryLow: number;
  readonly entryHigh: number;
  readonly invalidation: number;
  readonly target1: number;
  readonly target2: number;
  readonly risk: number;
  readonly reward: number;
  readonly riskReward: number | null;
}

export interface InvalidationDto {
  readonly kind: string;
  readonly label: string;
  /** Paise, for the price-based conditions. */
  readonly level: number | null;
}

/** The indicator readings behind a signal, as stored at detection. */
export interface SignalIndicatorsDto {
  readonly price: number;
  readonly changePercent: number | null;
  readonly vwap: number | null;
  readonly vwapDistancePercent: number | null;
  readonly vwapSlopePercent: number | null;
  readonly rsi: number | null;
  readonly adx: number | null;
  readonly atr: number | null;
  readonly atrPercent: number | null;
  readonly macdHistogram: number | null;
  readonly relativeVolume: number | null;
  readonly barRelativeVolume: number | null;
  /** Shares traded so far in the session. A count, not money. */
  readonly sessionVolume: number | null;
  readonly ema9: number | null;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly dayHigh: number | null;
  readonly dayLow: number | null;
  readonly dayOpen: number | null;
  readonly previousClose: number | null;
  readonly previousHigh: number | null;
  readonly previousLow: number | null;
  readonly openingRangeHigh: number | null;
  readonly openingRangeLow: number | null;
  readonly gapPercent: number | null;
  readonly trends: readonly {
    readonly minutes: number;
    readonly direction: 'long' | 'short' | 'flat';
    readonly strength: number;
    readonly detail: string;
  }[];
  readonly levels: readonly {
    readonly key: string;
    readonly label: string;
    readonly price: number;
    readonly significance: number;
    readonly kind: 'support' | 'resistance' | 'pivot';
  }[];
}

export interface IntradaySignalDto {
  readonly id: number;
  readonly symbol: string;
  readonly name: string;
  readonly sector: string | null;
  readonly kind: IntradaySignalKind;
  readonly direction: TradeDirection;
  readonly strategy: string;
  readonly state: IntradaySignalState;
  readonly quality: SignalQuality;
  /** 0-100 technical setup strength. Never a probability of profit. */
  readonly score: number;
  /** Null for signals written before the arithmetic was recorded. */
  readonly scoring: ScoreArithmeticDto | null;
  readonly regime: string;
  readonly levels: TechnicalLevelsDto;
  readonly invalidations: readonly InvalidationDto[];
  readonly indicators: SignalIndicatorsDto;
  readonly factors: readonly IntradayFactorDto[];
  readonly reasons: readonly IntradayReasonDto[];
  /** Present on the detail response only. */
  readonly timeline: readonly IntradayEventDto[];
  readonly triggerMinutes: number;
  readonly setupMinutes: number;
  readonly trendMinutes: number;
  readonly detectedAt: string;
  readonly triggeredAt: string | null;
  readonly updatedAt: string;
  readonly endedAt: string | null;
  readonly endReason: string | null;
  /** Excursion since the trigger, paise. Zero before it triggers. */
  readonly maxFavourable: number;
  readonly maxAdverse: number;
}

/** Mirrors `intraday_runs.status` — see `packages/db/src/schema/intraday.ts`. */
export type IntradayRunStatus = 'running' | 'ok' | 'partial' | 'failed' | 'skipped';

export interface IntradayRunDto {
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: IntradayRunStatus;
  readonly regime: string | null;
  readonly symbolsRequested: number;
  readonly symbolsEvaluated: number;
  readonly signalsCreated: number;
  readonly signalsUpdated: number;
  readonly skippedCount: number;
  readonly error: string | null;
}

export interface IntradaySummaryDto {
  readonly live: number;
  readonly longs: number;
  readonly shorts: number;
  readonly breakouts: number;
  readonly breakdowns: number;
  readonly invalidated: number;
  readonly targetMet: number;
}

export interface IntradayFeedDto {
  /** IST trading date the feed covers. */
  readonly tradingDate: string;
  readonly market: MarketStateDto;
  /** Where the clock says we are in the session. */
  readonly regime: string;
  readonly run: IntradayRunDto | null;
  readonly summary: IntradaySummaryDto;
  readonly signals: readonly IntradaySignalDto[];
  readonly fetchedAt: string;
  readonly refreshAfterSeconds: number;
  /**
   * True when the engine has not completed a pass recently enough for the
   * signals to be trusted as current. The UI must say so rather than showing
   * an old setup as a live opportunity.
   */
  readonly stale: boolean;
  /** Why the feed is empty, when it is — a quiet market or a stopped worker. */
  readonly notice: string | null;
}

/** BUY / SELL, the labels the UI shows for a direction. */
export const ACTION_LABEL: Record<TradeDirection, 'BUY' | 'SELL'> = {
  long: 'BUY',
  short: 'SELL',
};

export const KIND_LABEL: Record<IntradaySignalKind, string> = {
  breakout: 'Breakout',
  breakdown: 'Breakdown',
  vwap_reclaim: 'VWAP reclaim',
  vwap_breakdown: 'VWAP breakdown',
  momentum_long: 'Momentum',
  momentum_short: 'Momentum',
  trend_continuation_long: 'Trend continuation',
  trend_continuation_short: 'Trend continuation',
  reversal_long: 'Reversal',
  reversal_short: 'Reversal',
};

export const STATE_LABEL: Record<IntradaySignalState, string> = {
  watching: 'Watching',
  forming: 'Setup forming',
  triggered: 'Triggered',
  confirmed: 'Confirmed',
  active: 'Active',
  invalidated: 'Invalidated',
  expired: 'Expired',
  target_met: 'Target met',
};

export const QUALITY_LABEL: Record<SignalQuality, string> = {
  exceptional: 'Exceptional setup',
  strong: 'Strong setup',
  good: 'Good setup',
  watch: 'Watch',
};

export const CATEGORY_LABEL: Record<ScoreCategory, string> = {
  trend: 'Trend',
  priceAction: 'Price action',
  momentum: 'Momentum',
  volume: 'Volume',
  vwap: 'VWAP',
  marketContext: 'Market',
  volatility: 'Volatility',
  multiTimeframe: 'Timeframes',
};

/** Signals that have triggered and not yet ended. */
export const LIVE_STATES: readonly IntradaySignalState[] = ['triggered', 'confirmed', 'active'];
/** Signals that are over, one way or another. */
export const TERMINAL_STATES: readonly IntradaySignalState[] = [
  'invalidated',
  'expired',
  'target_met',
];

export function isLiveState(state: IntradaySignalState): boolean {
  return LIVE_STATES.includes(state);
}

export function isTerminalState(state: IntradaySignalState): boolean {
  return TERMINAL_STATES.includes(state);
}
