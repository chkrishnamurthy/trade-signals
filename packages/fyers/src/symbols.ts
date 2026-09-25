import type { Exchange, InstrumentKind } from './types.js';

/**
 * The single place our symbols and Fyers' symbols are mapped to each other.
 *
 * Fyers' formats, per the v3 docs and the live symbol masters (2026-09-25):
 *   NSE equities  NSE:RELIANCE-EQ
 *   NSE indices   NSE:NIFTY50-INDEX, NSE:NIFTYBANK-INDEX
 *   BSE equities  BSE:RELIANCE-A, BSE:3IINFOLTD-T   (suffix = the BSE group)
 *   BSE indices   BSE:SENSEX-INDEX, BSE:BANKEX-INDEX
 *
 * Ours are the bare underlying: `RELIANCE`, `NIFTY50`, `SENSEX`. The exchange
 * travels separately.
 *
 * A BSE equity's suffix is its group, which the exchange reassigns (A → T on
 * surveillance, and back). It therefore cannot be templated from our symbol:
 * the caller supplies the group, which the adapter reads from the BSE master.
 */

export const NSE_PREFIX = 'NSE:';
export const BSE_PREFIX = 'BSE:';
const EQUITY_SUFFIX = '-EQ';
const INDEX_SUFFIX = '-INDEX';

const PREFIX: Readonly<Record<Exchange, string>> = { NSE: NSE_PREFIX, BSE: BSE_PREFIX };

/**
 * `RELIANCE` -> `NSE:RELIANCE-EQ`; `NIFTY50` -> `NSE:NIFTY50-INDEX`;
 * (`RELIANCE`, BSE, group `A`) -> `BSE:RELIANCE-A`.
 *
 * An index we name differently from Fyers (`NIFTYNEXT50` -> `NIFTYNXT50`) goes
 * out under Fyers' ticker — the reverse of {@link SYMBOL_ALIASES} — so a quote
 * or bars request for it does not answer -300 (invalid symbol).
 */
export function toFyersSymbol(
  symbol: string,
  kind: InstrumentKind,
  exchange: Exchange = 'NSE',
  group?: string,
): string {
  const bare = symbol.trim().toUpperCase();
  if (bare === '') {
    throw new RangeError('toFyersSymbol: symbol must not be empty');
  }
  const prefix = PREFIX[exchange];
  if (kind === 'index') {
    const aliased = FYERS_TICKER_FOR[`${prefix}${bare}`];
    return aliased ?? `${prefix}${bare}${INDEX_SUFFIX}`;
  }
  if (exchange === 'NSE') return `${prefix}${bare}${EQUITY_SUFFIX}`;
  const suffix = (group ?? '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(suffix)) {
    throw new RangeError(`toFyersSymbol: a BSE equity needs its group, got '${group ?? ''}'`);
  }
  return `${prefix}${bare}-${suffix}`;
}

export interface ParsedFyersSymbol {
  readonly symbol: string;
  readonly kind: InstrumentKind;
  readonly exchange: Exchange;
  /** BSE group for a BSE equity (`A`, `T`, `XT`…); null otherwise. */
  readonly group: string | null;
}

/** `NSE:RELIANCE-EQ` -> `{ symbol: 'RELIANCE', kind: 'equity', exchange: 'NSE' }`. */
export function parseFyersSymbol(fyersSymbol: string): ParsedFyersSymbol {
  const text = fyersSymbol.trim().toUpperCase();
  let exchange: Exchange;
  if (text.startsWith(NSE_PREFIX)) exchange = 'NSE';
  else if (text.startsWith(BSE_PREFIX)) exchange = 'BSE';
  else {
    throw new RangeError(
      `parseFyersSymbol: only NSE and BSE symbols are supported, got ${fyersSymbol}`,
    );
  }

  const body = text.slice(PREFIX[exchange].length);
  if (body.endsWith(INDEX_SUFFIX)) {
    const symbol = body.slice(0, -INDEX_SUFFIX.length);
    if (symbol !== '') return { symbol, kind: 'index', exchange, group: null };
  }
  if (exchange === 'NSE') {
    if (body.endsWith(EQUITY_SUFFIX) && body.length > EQUITY_SUFFIX.length) {
      return {
        symbol: body.slice(0, -EQUITY_SUFFIX.length),
        kind: 'equity',
        exchange,
        group: null,
      };
    }
    throw new RangeError(
      `parseFyersSymbol: ${fyersSymbol} ends with neither ${EQUITY_SUFFIX} nor ${INDEX_SUFFIX}`,
    );
  }
  // BSE equity: the group is after the LAST hyphen — scrip ids may contain one.
  const dash = body.lastIndexOf('-');
  const group = dash > 0 ? body.slice(dash + 1) : '';
  if (!/^[A-Z]{1,3}$/.test(group)) {
    throw new RangeError(`parseFyersSymbol: ${fyersSymbol} has no BSE group suffix`);
  }
  return { symbol: body.slice(0, dash), kind: 'equity', exchange, group };
}

/** True for a well-formed NSE or BSE equity or index symbol. */
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
 * `NIFTYMIDSELECT` are the same instrument), and names some BSE indices by a
 * bare number (`BSE:500-INDEX`). Where our internal name should differ from
 * the bare Fyers name, record it here rather than special-casing at the call
 * site. BSE index names follow Dhan's (`BSE500`) so both providers agree.
 */
export const SYMBOL_ALIASES: Readonly<Record<string, string>> = {
  'NSE:NIFTYNXT50-INDEX': 'NIFTYNEXT50',
  'NSE:MIDCPNIFTY-INDEX': 'NIFTYMIDSELECT',
  'BSE:100-INDEX': 'BSE100',
  'BSE:200-INDEX': 'BSE200',
  'BSE:500-INDEX': 'BSE500',
};

/** `EXCHANGE:ourSymbol` -> the full Fyers symbol, for the aliases above. */
const FYERS_TICKER_FOR: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SYMBOL_ALIASES).map(([fyersSymbol, ours]) => [
    `${fyersSymbol.slice(0, fyersSymbol.indexOf(':') + 1)}${ours}`,
    fyersSymbol,
  ]),
);

/** Applies {@link SYMBOL_ALIASES}, falling back to the parsed bare symbol. */
export function internalSymbolFor(fyersSymbol: string): string {
  const alias = SYMBOL_ALIASES[fyersSymbol.trim().toUpperCase()];
  return alias ?? parseFyersSymbol(fyersSymbol).symbol;
}

/** Exchange of a Fyers symbol, without validating the rest of it. */
export function exchangeOfFyersSymbol(fyersSymbol: string): Exchange {
  return fyersSymbol.trim().toUpperCase().startsWith(BSE_PREFIX) ? 'BSE' : 'NSE';
}
