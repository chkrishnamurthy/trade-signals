import type { NextResponse } from 'next/server';
import { limitByIp } from '@/server/auth/request-limit';
import { checkStatement, statementCheckSchema } from '@/server/portfolio';
import { handle, ok, parseBody } from '@/server/watchlist-routes';

/**
 * POST /api/portfolio/statement-check { asOf, holdings } — compares the user's
 * record with the equity shares a CAS lists (read from the PDF in the browser).
 * Nothing is saved; the statement's rows are dropped after the comparison.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const limited = limitByIp(request, 'portfolio-statement', { max: 30, windowMs: 3_600_000 });
    if (limited !== null) return limited;
    const body = await parseBody(request, statementCheckSchema);
    if (!body.ok) return body.response;
    return ok(await checkStatement(body.data));
  });
}
