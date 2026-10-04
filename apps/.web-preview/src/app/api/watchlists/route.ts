import type { NextResponse } from 'next/server';
import { handle, ok, parseBody } from '@/server/watchlist-routes';
import { createWatchlistSchema } from '@/server/watchlist-schemas';
import { addWatchlist, getWatchlists } from '@/server/watchlists';

/**
 * GET  /api/watchlists — every watchlist with its member count.
 * POST /api/watchlists — create one.
 *
 * The sidebar's feed. Deliberately does not carry rows: the sidebar renders
 * fifty names and none of their prices, and folding the two together would make
 * switching lists cost a quote fetch for every list.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok({ watchlists: await getWatchlists() }));
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, createWatchlistSchema);
    if (!body.ok) return body.response;
    return ok({ watchlist: await addWatchlist(body.data.name) }, 201);
  });
}
