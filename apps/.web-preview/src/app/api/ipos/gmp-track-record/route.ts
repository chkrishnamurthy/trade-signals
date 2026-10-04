import type { NextResponse } from 'next/server';
import { parseQuery } from '@/server/ipo-routes';
import { gmpTrackQuerySchema } from '@/server/ipo-schemas';
import { getGmpTrackRecord } from '@/server/ipos';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET /api/ipos/gmp-track-record?months=12&board= — for listed issues, the
 * last UNOFFICIAL grey-market premium before listing against the actual
 * listing gain, with counts. A breakdown, never a score.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const query = parseQuery(request, gmpTrackQuerySchema);
    if (!query.ok) return query.response;
    return ok(await getGmpTrackRecord(query.data));
  });
}
