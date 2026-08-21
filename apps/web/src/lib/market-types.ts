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
}
