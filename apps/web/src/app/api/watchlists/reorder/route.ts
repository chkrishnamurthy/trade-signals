import type { NextResponse } from 'next/server';
import { handle, ok, parseBody } from '@/server/watchlist-routes';
import { reorderSchema } from '@/server/watchlist-schemas';
import { getWatchlists, reorder } from '@/server/watchlists';

/**
 * POST /api/watchlists/reorder — rewrite sidebar order from a complete id list.
 *
 * Takes the whole order rather than a move instruction. A drag produces a final
 * arrangement, and sending that is idempotent; sending "move 4 above 2" is not,
 * and replaying it after a retry silently corrupts the order.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, reorderSchema);
    if (!body.ok) return body.response;
    await reorder(body.data.ids);
    return ok({ watchlists: await getWatchlists() });
  });
}
