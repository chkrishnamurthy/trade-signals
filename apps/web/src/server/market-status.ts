import 'server-only';
import type { MarketStatus } from '@wealthos/market-data';
import { getProvider } from './provider';

/**
 * Exchange session state, cached.
 *
 * Extracted so the dashboard and the signals feed share one cache entry rather
 * than each spending a request on it. Status changes a handful of times a day;
 * refetching it per poll would be a third of the request budget spent on a
 * value that cannot have changed.
 *
 * A failed lookup is cached too, so a banned path is not retried on every
 * single request. Callers get `null` and must degrade to `unknown` rather than
 * assuming the market is open.
 */

const TTL_MS = 60_000;

let cache: { status: MarketStatus | null; expiresAt: number } | null = null;

export async function getMarketStatus(): Promise<MarketStatus | null> {
  const now = Date.now();
  if (cache !== null && cache.expiresAt > now) return cache.status;

  const status = await getProvider()
    .fetchMarketStatus()
    .catch(() => null);
  cache = { status, expiresAt: now + TTL_MS };
  return status;
}
