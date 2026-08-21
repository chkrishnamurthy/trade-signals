/**
 * Dashboard wire types.
 *
 * All prices are integer PAISE; all instants are ISO-8601 strings. `null`
 * always means "not supplied by the exchange", never zero.
 */
import type { MarketStatusCode, QuoteDto } from './market-types';

export type SignalDirection =
  | 'strong_bullish'
  | 'bullish'
  | 'neutral'
  | 'bearish'
  | 'strong_bearish';

export interface HeadlineIndexDto {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'index' | 'volatility';
  readonly ltp: number;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
  /** Closing prices, integer paise, oldest first. Empty when unavailable. */
  readonly sparkline: readonly number[];
}

export interface BreadthDto {
  readonly advancing: number;
  readonly declining: number;
  readonly unchanged: number;
  readonly total: number;
  /** advancing ÷ declining. null when nothing is declining. */
  readonly advanceDeclineRatio: number | null;
  readonly percentPositive: number;
  readonly percentNegative: number;
  /** Within 1% of the day's high / low. */
  readonly nearDayHigh: number;
  readonly nearDayLow: number;
  /** Null when daily history has not loaded yet. */
  readonly aboveEma20: number | null;
  readonly aboveEma50: number | null;
  readonly aboveEma200: number | null;
  readonly withIndicators: number;
}

export interface SentimentDto {
  readonly label: 'Bullish' | 'Mildly bullish' | 'Neutral' | 'Mildly bearish' | 'Bearish';
  /** 0–100. 50 is neutral. */
  readonly score: number;
  readonly breadth: BreadthDto;
  /** Plain-language inputs that produced the score. */
  readonly drivers: readonly { readonly label: string; readonly detail: string }[];
}

export interface SectorDto {
  readonly name: string;
  /** Mean change% of the sector's constituents. */
  readonly changePercent: number;
  readonly advancing: number;
  readonly declining: number;
  readonly count: number;
  readonly symbols: readonly string[];
}

export interface MoverDto extends QuoteDto {
  readonly sector: string;
  /** Volume ÷ 20-day average. Null until daily history loads. */
  readonly relativeVolume: number | null;
  readonly turnover: number | null;
}

export interface SignalFactorDto {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly weight: number;
  readonly detail: string;
}

export interface StockSignalDto {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
  readonly ltp: number;
  readonly changePercent: number | null;
  readonly direction: SignalDirection;
  readonly strength: number;
  readonly setups: readonly string[];
  readonly factors: readonly SignalFactorDto[];
  readonly rsi: number | null;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly ema200: number | null;
  readonly macdHistogram: number | null;
  readonly atr: number | null;
  readonly relativeVolume: number | null;
  readonly high52w: number | null;
  readonly low52w: number | null;
}

export interface SwingCandidateDto {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
  readonly setup: string;
  readonly ltp: number;
  readonly changePercent: number | null;
  readonly strength: number;
  readonly direction: SignalDirection;
  readonly rsi: number | null;
  readonly relativeVolume: number | null;
  readonly met: number;
  readonly total: number;
  readonly criteria: readonly {
    readonly label: string;
    readonly met: boolean;
    readonly detail: string;
  }[];
}

export interface ActivityEventDto {
  readonly at: string;
  readonly symbol: string;
  readonly message: string;
  readonly tone: 'bullish' | 'bearish' | 'neutral';
}

export interface QuickStatsDto {
  readonly totalVolume: number;
  readonly totalTurnover: number | null;
  readonly advancing: number;
  readonly declining: number;
  readonly nearHigh52w: number | null;
  readonly nearLow52w: number | null;
}

export interface DashboardDto {
  readonly indices: readonly HeadlineIndexDto[];
  readonly sentiment: SentimentDto;
  readonly sectors: readonly SectorDto[];
  readonly gainers: readonly MoverDto[];
  readonly losers: readonly MoverDto[];
  readonly mostActive: readonly MoverDto[];
  readonly unusualVolume: readonly MoverDto[];
  readonly quotes: readonly MoverDto[];
  readonly quickStats: QuickStatsDto;
  readonly market: { readonly isOpen: boolean; readonly status: MarketStatusCode };
  readonly fetchedAt: string;
  readonly cached: boolean;
  readonly missing: readonly string[];
  readonly refreshAfterSeconds: number;
  /**
   * True when indicator-derived fields are present. They arrive on a slower
   * cycle than quotes because each one costs a separate Fyers history call.
   */
  readonly indicatorsReady: boolean;
}

export interface SignalsDto {
  readonly signals: readonly StockSignalDto[];
  readonly swing: readonly SwingCandidateDto[];
  readonly activity: readonly ActivityEventDto[];
  readonly breadthExtras: {
    readonly aboveEma20: number;
    readonly aboveEma50: number;
    readonly aboveEma200: number;
    readonly total: number;
  };
  readonly computedAt: string;
  /** Symbols whose history could not be fetched. */
  readonly skipped: readonly string[];
}
