import type { NextResponse } from 'next/server';
import { handle, jsonError, ok, parseBody, parseId } from '@/server/watchlist-routes';
import { updateWatchlistSchema } from '@/server/watchlist-schemas';
import { getWatchlistDetail, removeWatchlist, updateWatchlist } from '@/server/watchlists';

/**
 * GET    /api/watchlists/:id — the watchlist, its rows, its layout, its views.
 * PATCH  /api/watchlists/:id — rename, or make default.
 * DELETE /api/watchlists/:id — remove it and everything in it.
 *
 * GET is the polled feed. It composes live quotes with stored daily indicators
 * and reports `refreshAfterSeconds` so the client polls on the server's terms —
 * the same contract the dashboard and stocks feeds use, and the only place that
 * knows whether the market is open or the upstream handed back a Retry-After.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

    const detail = await getWatchlistDetail(id);
    if (detail === null) {
      return jsonError('That watchlist no longer exists.', 404, { code: 'NOT_FOUND' });
    }
    return ok(detail);
  });
}

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

    const body = await parseBody(request, updateWatchlistSchema);
    if (!body.ok) return body.response;

    const updated = await updateWatchlist(id, body.data);
    if (!updated) {
      return jsonError('That watchlist no longer exists.', 404, { code: 'NOT_FOUND' });
    }
    return ok({ updated: true });
  });
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

    const removed = await removeWatchlist(id);
    if (!removed) {
      return jsonError('That watchlist no longer exists.', 404, { code: 'NOT_FOUND' });
    }
    return ok({ deleted: true });
  });
}
