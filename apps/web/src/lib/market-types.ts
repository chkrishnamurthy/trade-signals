/**
 * Wire types shared by the market API route and the client.
 *
 * These cross a JSON boundary, so every price is an integer number of PAISE
 * (CLAUDE.md hard rule 3) and every instant is an ISO-8601 string. The client
 * formats paise for display with `formatPaise` and never does price arithmetic.
 *
 * `null` always means "the exchange did not supply this", never zero.
 */

/**
 * Market status.
 *
 * The v3 spec documents PREOPEN / OPEN / CLOSE / POSTCLOSE_START / CTS_CLOSE /
 * CAS_*, but the live API also returns values the docs omit — POSTCLOSE_CLOSED
 * was observed on 2026-08-21. The trailing `(string & {})` keeps the known
 * values autocompleting while accepting whatever else the exchange sends, so an
 * undocumented status degrades to a readable label instead of `undefined`.
 */
export type KnownMarketStatus =
  | 'PREOPEN'
  | 'OPEN'
  | 'CLOSE'
  | 'POSTCLOSE_START'
  | 'POSTCLOSE_CLOSED'
  | 'CTS_CLOSE'
  | 'CAS_START'
  | 'CAS_MKT_ORD_RESTRICT'
  | 'CAS_END'
  | 'UNKNOWN';

/** `string & {}` keeps literal autocomplete while accepting any string. */
export type MarketStatusCode = KnownMarketStatus | (string & {});

export interface QuoteDto {
  /** Internal symbol, e.g. `RELIANCE`. */
  readonly symbol: string;
  /** Fyers symbol, e.g. `NSE:RELIANCE-EQ`. */
  readonly fyersSymbol: string;
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
  /** ISO-8601. */
  readonly timestamp: string | null;
}

export interface IndexQuoteDto {
  readonly symbol: string;
  readonly fyersSymbol: string;
  readonly name: string;
  readonly ltp: number;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
}

export interface MarketSnapshotDto {
  readonly index: IndexQuoteDto | null;
  readonly constituents: readonly QuoteDto[];
  readonly market: {
    readonly isOpen: boolean;
    readonly status: MarketStatusCode;
  };
  /** ISO-8601 — when this snapshot was fetched from Fyers. */
  readonly fetchedAt: string;
  /** True when served from the server-side cache rather than a fresh call. */
  readonly cached: boolean;
  /** Symbols Fyers returned no usable quote for. Surfaced, never hidden. */
  readonly missing: readonly string[];
  /** Seconds the client should wait before polling again. */
  readonly refreshAfterSeconds: number;
}

export interface MarketErrorDto {
  readonly error: string;
  /** What the operator must do, when the failure is actionable. */
  readonly remedy?: string;
  readonly code?: string;
}
