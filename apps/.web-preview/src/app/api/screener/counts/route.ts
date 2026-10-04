import type { NextResponse } from 'next/server';
import { screenCountsForViewer } from '@/server/screener';
import { countsSchema } from '@/server/screener-schemas';
import { handle, ok, parseBody } from '@/server/watchlist-routes';

/**
 * POST /api/screener/counts — how many stocks each top-level condition keeps,
 * alone and cumulatively (the funnel). One scan of the snapshot.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, countsSchema);
    if (!body.ok) return body.response;
    return ok(await screenCountsForViewer(body.data));
  });
}
