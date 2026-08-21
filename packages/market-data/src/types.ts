/**
 * Provider-neutral market data.
 *
 * These are the ONLY market-data shapes the product knows about. No provider
 * field name, symbol format, resolution code, or error type appears here or
 * anywhere downstream of here (CLAUDE.md: broker independence).
 *
 * All prices are integer paise (hard rule 3). All timestamps are UTC.
 */

export type InstrumentKind = 'equity' | 'index';

export type Exchange = 'NSE' | 'BSE';

/**
 * The minimum needed to ask a provider for data about something.
 *
 * `symbol` is OUR symbol — `RELIANCE`, `NIFTY50` — never `NSE:RELIANCE-EQ`.
 * `kind` is required because providers encode equities and indices
 * differently, and only the adapter should know how.
 */
export interface InstrumentRef {
  readonly symbol: string;
  readonly kind: InstrumentKind;
  readonly exchange?: Exchange;
}

/** A tradeable or trackable instrument. */
export interface Instrument {
  readonly symbol: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly exchange: Exchange;
  readonly isin: string | null;
  readonly lotSize: number;
  /** Minimum price increment, in paise. */
  readonly tickSize: number;
  /**
   * The provider's own stable identifier, opaque to the product.
   *
   * Kept so ingestion can survive a ticker rename, but never rendered, never
   * used as a key, and never sent to the browser.
   */
  readonly providerRef: string | null;
}

/** A point-in-time snapshot. `null` means the provider did not supply it. */
export interface Quote {
  readonly symbol: string;
  /** Last traded price, paise. Always present — a quote without one is dropped. */
  readonly ltp: number;
  /** Change vs previous close, paise. Signed; 0 is meaningful. */
  readonly change: number | null;
  /** A ratio, not money, so it stays a float. */
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
  readonly averagePrice: number | null;
  /** Shares traded today. A count, not money. */
  readonly volume: number | null;
  /** Exchange feed time, UTC. Null when the provider omitted it. */
  readonly timestamp: Date | null;
}

/**
 * One OHLCV bar. `timestamp` is the instant the bar OPENS, epoch milliseconds.
 *
 * Structurally identical to `@signal/core`'s `Bar` so the engine consumes
 * provider output with no adaptation step.
 */
export interface Bar {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/**
 * Timeframes the product asks for.
 *
 * Deliberately a small closed set in OUR vocabulary. Mapping to a provider's
 * resolution codes is the adapter's job.
 */
export type Resolution = '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1w';

export const ALL_RESOLUTIONS: readonly Resolution[] = ['1m', '5m', '15m', '30m', '1h', '1d', '1w'];

/** True for a resolution that closes only at the end of a session or later. */
export function isDailyOrSlower(resolution: Resolution): boolean {
  return resolution === '1d' || resolution === '1w';
}

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

/**
 * Exchange session state.
 *
 * `isOpen` is true ONLY for continuous trading — not pre-open, not the closing
 * auction. Anything else showing a "live" badge would be a lie.
 */
export interface MarketStatus {
  readonly isOpen: boolean;
  readonly phase: MarketPhase;
  readonly checkedAt: Date;
}

export type MarketPhase =
  | 'pre_open'
  | 'open'
  | 'closed'
  | 'post_close'
  | 'closing_auction'
  | 'unknown';

/** A live price update. */
export interface Tick {
  readonly symbol: string;
  /** Last traded price, paise. */
  readonly ltp: number;
  readonly lastTradedAt: Date | null;
  readonly exchangeFeedAt: Date | null;
  readonly volumeToday: number | null;
}

export interface QuotesResult {
  /** Keyed by OUR symbol. */
  readonly quotes: ReadonlyMap<string, Quote>;
  /**
   * Symbols the provider accepted but returned no usable quote for.
   *
   * Propagated rather than silently dropped: a breadth count computed over a
   * smaller denominator than the caller believes is a data-integrity bug.
   */
  readonly missing: readonly string[];
}
