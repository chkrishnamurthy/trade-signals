import type { NextResponse } from 'next/server';
import { handle, ok, parseBody } from '@/server/api-response';
import { runScreenForViewer } from '@/server/screener';
import { runScreenSchema } from '@/server/screener-schemas';

/**
 * POST /api/screener/run — one page of a screen over the latest (or `asOf`)
 * snapshot. A body rather than a query string: the filter is a tree.
 * Reads the worker-built snapshot only; never calls a market-data provider.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, runScreenSchema);
    if (!body.ok) return body.response;
    return ok(await runScreenForViewer(body.data));
  });
}
