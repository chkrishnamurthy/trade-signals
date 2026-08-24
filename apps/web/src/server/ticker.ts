import 'server-only';
import type { MarketTickerDto } from '@/lib/ticker-types';
import { getDashboard, getStaleDashboard } from './dashboard';

/**
 * The global ticker snapshot.
 *
 * Cost: ZERO extra upstream calls. It projects the dashboard snapshot, which is
 * already built, cached and in-flight-deduped per index key in `dashboard.ts`.
 * A user sitting on `/watchlists` with the ticker polling therefore spends the
 * same rate-limit budget as one sitting on the dashboard, not double.
 *
 * Sentiment is breadth over an index's constituents, so it needs a basis. The
 * NSE benchmark is the one every other surface already summarises, and it is
 * the snapshot the dashboard warms anyway — picking a different basis here
 * would mean a second set of fifty quotes for a single word in the header.
 */
const TICKER_BASIS = 'nifty50';

function project(snapshot: Awaited<ReturnType<typeof getDashboard>>): MarketTickerDto {
  return {
    // Headline indices are global config, not per-index, so they are the same
    // list the dashboard cards render — the ticker just drops the sparkline.
    indices: snapshot.indices.map(({ sparkline: _sparkline, ...index }) => index),
    market: snapshot.market,
    sentiment: { label: snapshot.sentiment.label },
    fetchedAt: snapshot.fetchedAt,
    cached: snapshot.cached,
    refreshAfterSeconds: snapshot.refreshAfterSeconds,
  };
}

export async function getMarketTicker(): Promise<MarketTickerDto> {
  return project(await getDashboard(TICKER_BASIS));
}

/** The last good snapshot, for serving through a transient upstream failure. */
export function getStaleMarketTicker(): MarketTickerDto | null {
  const stale = getStaleDashboard(TICKER_BASIS);
  return stale === null ? null : project(stale);
}
