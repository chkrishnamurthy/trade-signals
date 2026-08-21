import type { InstrumentKind } from './types.js';

/**
 * The single place our symbols and Fyers' symbols are mapped to each other.
 *
 * Fyers' formats, per the v3 docs:
 *   equities  NSE:RELIANCE-EQ
 *   indices   NSE:NIFTY50-INDEX, NSE:NIFTYBANK-INDEX
 *
 * Ours are the bare underlying: `RELIANCE`, `NIFTY50`, `NIFTYBANK`.
 */

export const NSE_PREFIX = 'NSE:';
const EQUITY_SUFFIX = '-EQ';
const INDEX_SUFFIX = '-INDEX';

/** `RELIANCE` -> `NSE:RELIANCE-EQ`; `NIFTY50` -> `NSE:NIFTY50-INDEX`. */
export function toFyersSymbol(symbol: string, kind: InstrumentKind): string {
  const bare = symbol.trim().toUpperCase();
  if (bare === '') {
    throw new RangeError('toFyersSymbol: symbol must not be empty');
  }
  return `${NSE_PREFIX}${bare}${kind === 'index' ? INDEX_SUFFIX : EQUITY_SUFFIX}`;
}

export interface ParsedFyersSymbol {
  readonly symbol: string;
  readonly kind: InstrumentKind;
  readonly exchange: 'NSE';
}

/** `NSE:RELIANCE-EQ` -> `{ symbol: 'RELIANCE', kind: 'equity' }`. */
export function parseFyersSymbol(fyersSymbol: string): ParsedFyersSymbol {
  const text = fyersSymbol.trim().toUpperCase();
  if (!text.startsWith(NSE_PREFIX)) {
    throw new RangeError(`parseFyersSymbol: only NSE symbols are supported, got ${fyersSymbol}`);
  }

  const body = text.slice(NSE_PREFIX.length);
  if (body.endsWith(INDEX_SUFFIX)) {
    return { symbol: body.slice(0, -INDEX_SUFFIX.length), kind: 'index', exchange: 'NSE' };
  }
  if (body.endsWith(EQUITY_SUFFIX)) {
    return { symbol: body.slice(0, -EQUITY_SUFFIX.length), kind: 'equity', exchange: 'NSE' };
  }
  throw new RangeError(
    `parseFyersSymbol: ${fyersSymbol} ends with neither ${EQUITY_SUFFIX} nor ${INDEX_SUFFIX}`,
  );
}

/** True for a well-formed NSE equity or index symbol. */
export function isFyersSymbol(value: string): boolean {
  try {
    parseFyersSymbol(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Percent-encodes a symbol for use in a URL query string.
 *
 * The docs call this out explicitly: `M&M` must go over the wire as `M%26M` or
 * the API answers -300 (invalid symbol). `encodeURIComponent` handles `&`, and
 * leaves the `:` and `-` that Fyers requires intact.
 */
export function encodeFyersSymbol(fyersSymbol: string): string {
  return encodeURIComponent(fyersSymbol);
}

/**
 * Symbol-master rows whose ticker does not match our derived form.
 *
 * Fyers publishes some indices under two tickers (`MIDCPNIFTY` and
 * `NIFTYMIDSELECT` are the same instrument). Where our internal name should
 * differ from the bare Fyers name, record it here rather than special-casing at
 * the call site.
 */
export const SYMBOL_ALIASES: Readonly<Record<string, string>> = {
  'NSE:NIFTYNXT50-INDEX': 'NIFTYNEXT50',
  'NSE:MIDCPNIFTY-INDEX': 'NIFTYMIDSELECT',
};

/** Applies {@link SYMBOL_ALIASES}, falling back to the parsed bare symbol. */
export function internalSymbolFor(fyersSymbol: string): string {
  const alias = SYMBOL_ALIASES[fyersSymbol.trim().toUpperCase()];
  return alias ?? parseFyersSymbol(fyersSymbol).symbol;
}
