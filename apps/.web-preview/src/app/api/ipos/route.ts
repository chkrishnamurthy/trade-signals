import type { NextResponse } from 'next/server';
import { parseQuery } from '@/server/ipo-routes';
import { ipoListQuerySchema } from '@/server/ipo-schemas';
import { getIposPage } from '@/server/ipos';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET /api/ipos — the IPOs page data for the signed-in user.
 *
 * Query: `status=upcoming|open|closed|listed|withdrawn|postponed`,
 * `board=mainboard|sme`, `exchange=NSE|BSE`, `q=` (company or symbol), `page=`.
 * Read-only; auth via middleware + the service; logic in the server layer.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const query = parseQuery(request, ipoListQuerySchema);
    if (!query.ok) return query.response;
    return ok(await getIposPage(query.data));
  });
}
