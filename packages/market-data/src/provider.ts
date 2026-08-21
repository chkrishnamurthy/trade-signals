import type { MarketDataProviderError } from './errors.js';
import type {
  Bar,
  DateRange,
  Instrument,
  InstrumentRef,
  MarketStatus,
  QuotesResult,
  Resolution,
  Tick,
} from './types.js';

/**
 * What the product needs from a market-data source.
 *
 * Everything above this interface — the indicator engine, the screener, the
 * signal engine, every route handler and every component — is written against
 * this and nothing else. Adding a second provider means writing one more
 * implementation, not touching business logic (CLAUDE.md: broker independence).
 *
 * Contract every implementation must honour:
 *
 *  - Symbols in and out are OUR symbols (`RELIANCE`), never a provider format.
 *  - Prices are integer paise. A rupee float must not escape an adapter.
 *  - A missing field is `null`. Never 0, never a guess, never a stale carry-over.
 *  - Failures throw {@link MarketDataProviderError}. A provider's own error type
 *    must not escape.
 *  - `fetchBars` returns ascending, deduplicated, CLOSED bars unless
 *    `includeForming` is explicitly set (hard rule 2).
 */
export interface MarketDataProvider {
  /** Stable machine id, e.g. `fyers`. Used in logs and config. */
  readonly id: string;
  /** For operator-facing text only. Never rendered as product branding. */
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  /** The full tradeable universe. Expensive; callers should cache. */
  listInstruments(): Promise<readonly Instrument[]>;

  /** Snapshot quotes. Implementations batch internally. */
  fetchQuotes(refs: readonly InstrumentRef[]): Promise<QuotesResult>;

  /** Historical bars, ascending, deduplicated, closed-only by default. */
  fetchBars(request: BarsRequest): Promise<readonly Bar[]>;

  /** Authoritative session state — the exchange knows about holidays and halts. */
  fetchMarketStatus(): Promise<MarketStatus>;

  /**
   * Live tick subscription. Present only when
   * `capabilities.streaming` is true.
   */
  streamTicks?(request: StreamRequest): TickSubscription;
}

export interface BarsRequest {
  readonly ref: InstrumentRef;
  readonly resolution: Resolution;
  readonly range: DateRange;
  /**
   * Include the final, possibly-unfinished bar.
   *
   * Charts may. The signal engine must NEVER — that is lookahead bias and it
   * invalidates every backtest sharing the code path (hard rule 2).
   */
  readonly includeForming?: boolean;
  /** Wall clock, injected so "is the last bar still forming" stays testable. */
  readonly now?: Date;
}

export interface StreamRequest {
  readonly refs: readonly InstrumentRef[];
  readonly onTick: (tick: Tick) => void;
  /** Connection state changes, for staleness reporting in the UI. */
  readonly onStateChange?: (state: StreamState) => void;
  readonly onError?: (error: MarketDataProviderError) => void;
}

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'stopped';

export interface TickSubscription {
  readonly state: () => StreamState;
  /** Instant of the last message of any kind. Null before the first. */
  readonly lastMessageAt: () => Date | null;
  subscribe(refs: readonly InstrumentRef[]): void;
  unsubscribe(refs: readonly InstrumentRef[]): void;
  stop(): void;
}

/**
 * What a provider can actually do.
 *
 * Checked rather than assumed: a second provider may have no socket, or a
 * shorter history window, and the product must degrade visibly instead of
 * rendering an empty chart as though it were a flat market.
 */
export interface ProviderCapabilities {
  readonly streaming: boolean;
  readonly intradayHistory: boolean;
  readonly resolutions: readonly Resolution[];
  /** Earliest instant with data, or null if unbounded/unknown. */
  readonly historyStart: Date | null;
  /** Max symbols in one live subscription, or null for unlimited. */
  readonly maxStreamSymbols: number | null;
  /** Authoritative session state, vs inferring from a clock. */
  readonly marketStatus: boolean;
}
