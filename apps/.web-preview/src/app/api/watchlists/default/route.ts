import type { NextResponse } from 'next/server';
import { handle, ok } from '@/server/watchlist-routes';
import { getDefaultWatchlistMembers } from '@/server/watchlists';

/**
 * GET /api/watchlists/default — the default list's members, without prices.
 *
 * The dashboard's watchlist widget and the stock detail drawer need to know
 * which symbols are followed, and nothing else. Serving them the full detail
 * endpoint would spend a batched quote call on every dashboard load to render
 * a star icon.
 *
 * Answers `watchlistId: null` when no watchlist exists yet, which the client
 * turns into "create one on first star" rather than an error.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok(await getDefaultWatchlistMembers()));
}
