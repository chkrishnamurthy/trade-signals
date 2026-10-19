import type { WatchlistDetailDto } from './watchlist-types';

/**
 * A delayed quote cache needs user attention only during continuous trading.
 *
 * Once the market closes, the final available price is expected to remain
 * unchanged until the next session. Keeping this decision separate from the
 * component also prevents a provider/cache failure flag from turning a normal
 * post-close screen into an alarming stale-data warning.
 */
export function quoteUpdatesDelayed(
  detail: Pick<WatchlistDetailDto, 'market' | 'quotesStale'>,
): boolean {
  return detail.market.isOpen && detail.quotesStale;
}
