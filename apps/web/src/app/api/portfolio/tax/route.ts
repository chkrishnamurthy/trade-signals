import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTaxCsv } from '@/server/portfolio';
import { handle, jsonError, parseQuery } from '@/server/watchlist-routes';

/**
 * GET /api/portfolio/tax?year=2025-26 — one financial year's sales as CSV for
 * the user's accountant, laid out like the long-term gains schedule. Indicative;
 * not tax advice.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  year: z.string().regex(/^\d{4}-\d{2}$/, 'Choose a financial year like 2025-26.'),
});

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const query = parseQuery(new URL(request.url).searchParams, querySchema);
    if (!query.ok) return query.response;
    const csv = await getTaxCsv(query.data.year);
    if (csv === null)
      return jsonError('No sales in that financial year.', 404, { code: 'NO_SALES' });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="capital-gains-FY${query.data.year}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
