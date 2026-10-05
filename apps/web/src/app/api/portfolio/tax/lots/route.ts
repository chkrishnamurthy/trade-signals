import { NextResponse } from 'next/server';
import { getOpenLotsCsv } from '@/server/portfolio';
import { handle } from '@/server/watchlist-routes';

/**
 * GET /api/portfolio/tax/lots — every tax lot still held (acquired date, cost,
 * 31 Jan 2018 value, today's value, term) as CSV for the user's accountant.
 * Indicative; not tax advice.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const csv = await getOpenLotsCsv();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="shares-still-held.csv"',
        'Cache-Control': 'no-store',
      },
    });
  });
}
