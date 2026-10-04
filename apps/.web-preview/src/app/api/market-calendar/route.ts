import type { NextResponse } from 'next/server';
import { getMarketCalendar } from '@/server/market-calendar';
import { marketCalendarQuerySchema } from '@/server/market-calendar-schemas';
import { handle, ok, parseQuery } from '@/server/watchlist-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const query = parseQuery(new URL(request.url).searchParams, marketCalendarQuerySchema);
    if (!query.ok) return query.response;
    return ok(await getMarketCalendar(query.data));
  });
}
