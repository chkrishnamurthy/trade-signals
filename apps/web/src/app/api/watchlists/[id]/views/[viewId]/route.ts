import type { NextResponse } from 'next/server';
import { handle, jsonError, ok, parseId } from '@/server/watchlist-routes';
import { removeView } from '@/server/watchlists';

/** DELETE /api/watchlists/:id/views/:viewId — forget a saved configuration. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; viewId: string }> };

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const viewId = parseId((await params).viewId);
    if (viewId === null) return jsonError('Not a view id.', 400, { code: 'INVALID_ID' });

    const removed = await removeView(viewId);
    if (!removed) return jsonError('That view no longer exists.', 404, { code: 'NOT_FOUND' });
    return ok({ deleted: true });
  });
}
