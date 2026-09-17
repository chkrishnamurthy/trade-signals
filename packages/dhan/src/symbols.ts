import type { ExchangeSegment, InstrumentKind, InstrumentType } from './types.js';

/**
 * The single place our symbols and Dhan's tickers are mapped to each other.
 *
 * Dhan has no symbol-string addressing — every request carries a numeric
 * `securityId` — so, unlike Fyers, this file cannot template a string. What it
 * can do is normalise the *ticker* column of the scrip master into our
 * vocabulary, so the instrument index can be searched by `RELIANCE` or
 * `NIFTY50` and hand back the id.
 *
 * Equities are trivial: Dhan's `UNDERLYING_SYMBOL` is the NSE ticker, which is
 * our symbol. Indices are not: Dhan publishes `NIFTY`, `BANKNIFTY`,
 * `NIFTYNXT50`, `MIDCPNIFTY`, `NIFTY 100`, and ours are `NIFTY50`, `NIFTYBANK`,
 * `NIFTYNEXT50`, `NIFTYMIDSELECT`, `NIFTY100` — the Fyers-era names that
 * `config/indices.yaml` and the database already use.
 */

/** Segment for a kind. Indices of every exchange live in `IDX_I`. */
export function segmentFor(kind: InstrumentKind): ExchangeSegment {
  return kind === 'index' ? 'IDX_I' : 'NSE_EQ';
}

/** Dhan's `instrument` enum value for a kind. */
export function instrumentTypeFor(kind: InstrumentKind): InstrumentType {
  return kind === 'index' ? 'INDEX' : 'EQUITY';
}

/**
 * Index tickers whose normalised form still differs from our symbol.
 *
 * Keyed by Dhan's ticker with spaces removed and upper-cased (see
 * {@link normaliseTicker}). Anything not listed maps by that rule alone:
 * `NIFTY 100` → `NIFTY100`, `NIFTY IT` → `NIFTYIT`, `FINNIFTY` → `FINNIFTY`.
 * Verified against the detailed scrip master, 2026-09-16.
 */
export const INDEX_ALIASES: Readonly<Record<string, string>> = {
  NIFTY: 'NIFTY50',
  BANKNIFTY: 'NIFTYBANK',
  NIFTYNXT50: 'NIFTYNEXT50',
  MIDCPNIFTY: 'NIFTYMIDSELECT',
  INDIAVIX: 'INDIAVIX',
  NIFTYMID100FREE: 'NIFTYMIDCAP100',
};

/** Upper-case, spaces removed: the form both alias tables key on. */
export function normaliseTicker(ticker: string): string {
  return ticker.replace(/\s+/g, '').toUpperCase();
}

/** Our symbol for a scrip-master row's ticker. */
export function internalSymbolFor(dhanTicker: string, kind: InstrumentKind): string {
  const normalised = normaliseTicker(dhanTicker);
  if (kind === 'equity') return normalised;
  return INDEX_ALIASES[normalised] ?? normalised;
}
