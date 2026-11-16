import { NextResponse } from 'next/server';
import { handle } from '@/server/api-response';
import { getRealisedCsv } from '@/server/portfolio';

/**
 * GET /api/portfolio/realised — the signed-in user's realised gains as CSV, for
 * their own records. Matched oldest purchase first; not a tax computation.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const csv = await getRealisedCsv();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="realised-gains.csv"',
        'Cache-Control': 'no-store',
      },
    });
  });
}
