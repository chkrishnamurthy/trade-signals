import type { NextResponse } from 'next/server';
import { handle, ok } from '@/server/api-response';
import { getStockFlow } from '@/server/disclosures';

/**
 * GET /api/flows/:symbol — one stock's flow history for the drawer: delivery
 * sessions, futures OI sessions with build-up labels, its deals, and the last
 * eight quarters of shareholding. Reads persisted data only.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  return handle(async () => {
    const { symbol } = await context.params;
    return ok(await getStockFlow(symbol));
  });
}
