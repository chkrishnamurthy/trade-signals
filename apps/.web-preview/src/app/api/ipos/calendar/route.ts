import type { NextResponse } from 'next/server';
import { parseQuery } from '@/server/ipo-routes';
import { ipoCalendarQuerySchema } from '@/server/ipo-schemas';
import { getIpoCalendar } from '@/server/ipos';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET /api/ipos/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — IPO milestones per
 * day (at most 62 days). Dates computed from the T+3 rule say `expected: true`.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const query = parseQuery(request, ipoCalendarQuerySchema);
    if (!query.ok) return query.response;
    return ok(await getIpoCalendar(query.data.from, query.data.to));
  });
}
