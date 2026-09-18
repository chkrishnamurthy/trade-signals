/**
 * Wire types shared by the API routes and the client.
 *
 * These cross a JSON boundary, so every price is an integer number of PAISE
 * (CLAUDE.md hard rule 3) and every instant is an ISO-8601 string. The client
 * formats paise for display with `formatPaise` and never does price arithmetic.
 *
 * `null` always means "the exchange did not supply this", never zero.
 *
 * Nothing here names a data provider. The browser sees `RELIANCE`, never
 * `NSE:RELIANCE-EQ`, and session phases are ours, not any vendor's codes.
 */

/**
 * Exchange session phase.
 *
 * `open` means continuous trading and nothing else. The auction phases are
 * distinct because a price printed during a call auction is not a continuous
 * trading price, and badging it "live" would be a lie.
 */
export type MarketPhase =
  | 'pre_open'
  | 'open'
  | 'closed'
  | 'post_close'
  | 'closing_auction'
  | 'unknown';

export interface MarketStateDto {
  readonly isOpen: boolean;
  readonly phase: MarketPhase;
}

export interface QuoteDto {
  /** Our symbol, e.g. `RELIANCE`. */
  readonly symbol: string;
  readonly name: string;
  /** Last traded price, in paise. */
  readonly ltp: number;
  /** Absolute change vs previous close, in paise. Signed. */
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
  readonly averagePrice: number | null;
  readonly volume: number | null;
  /** ISO-8601 exchange feed time. */
  readonly timestamp: string | null;
}

export interface MarketErrorDto {
  readonly error: string;
  /** What the operator must do, when the failure is actionable. */
  readonly remedy?: string;
  readonly code?: string;
  /** Seconds to wait before retrying, when the upstream gave a deadline. */
  readonly retryAfterSeconds?: number;
}

// ---------------------------------------------------------------------------
// Market indices strip — the row of index cards under every page header.
// See docs/planning/market-indices-strip-plan.md.
// ---------------------------------------------------------------------------

/** One index card. */
export interface IndexSnapshotDto {
  /** Our symbol — `NIFTY50` — never a provider's. */
  readonly symbol: string;
  /** Display name — `NIFTY 50`. */
  readonly name: string;
  readonly exchange: 'NSE' | 'BSE';
  /**
   * How the card colours a move. A VIX rise is risk-off, so `volatility`
   * inverts the tone; the number itself is never flipped.
   */
  readonly display: 'index' | 'volatility';
  /** Index level, in paise (an index is not money, but the unit convention holds). */
  readonly ltp: number;
  /** Change vs previous close, paise, signed. */
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
  /** ISO exchange feed instant. Null when the provider omitted it. */
  readonly at: string | null;
}

export interface IndexStripDto {
  readonly indices: readonly IndexSnapshotDto[];
  readonly market: MarketStateDto;
  /** ISO instant the snapshot was built. */
  readonly asOf: string;
  /** Present when the last good snapshot is being served through a provider fault. */
  readonly stale?: { readonly reason: string };
}
