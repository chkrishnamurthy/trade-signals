/** A stock exchange the product covers. `@equitywise/market-data` re-exports it. */
export type Exchange = 'NSE' | 'BSE';

/**
 * Listing keys — how one exchange listing is named in a map, a URL or a DTO.
 *
 * A company can trade on both NSE and BSE under the same symbol, so `symbol`
 * alone no longer identifies a price. NSE is the home exchange: its key is the
 * bare symbol (`RELIANCE`), which keeps every existing key, URL and stored
 * payload valid. Any other exchange is qualified (`BSE:RELIANCE`), so the two
 * can never collide.
 *
 * This is OUR format, not a provider's — it only looks like Fyers' because
 * prefixing is the obvious notation. Adapters never see it. It lives here, not
 * in `@equitywise/market-data`, because the browser keys live quotes by it too.
 */

export const DEFAULT_EXCHANGE: Exchange = 'NSE';

export const EXCHANGES: readonly Exchange[] = ['NSE', 'BSE'];

/** The exchange a ref points at; an unqualified ref is NSE. */
export function exchangeOf(ref: { readonly exchange?: Exchange | undefined }): Exchange {
  return ref.exchange ?? DEFAULT_EXCHANGE;
}

/** `RELIANCE` for NSE, `BSE:RELIANCE` for BSE. */
export function listingKey(ref: {
  readonly symbol: string;
  readonly exchange?: Exchange | undefined;
}): string {
  const exchange = exchangeOf(ref);
  return exchange === DEFAULT_EXCHANGE ? ref.symbol : `${exchange}:${ref.symbol}`;
}

export function isExchange(value: string): value is Exchange {
  return (EXCHANGES as readonly string[]).includes(value);
}

/**
 * Inverse of {@link listingKey}. An unknown prefix is not an exchange, so the
 * whole string is the symbol — `M&M` and `BAJAJ-AUTO` stay intact.
 */
export function parseListingKey(key: string): { symbol: string; exchange: Exchange } {
  const colon = key.indexOf(':');
  if (colon > 0) {
    const prefix = key.slice(0, colon).toUpperCase();
    if (isExchange(prefix)) return { symbol: key.slice(colon + 1), exchange: prefix };
  }
  return { symbol: key, exchange: DEFAULT_EXCHANGE };
}
