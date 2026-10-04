import type { NextResponse } from 'next/server';
import { getInstitutionalFlow } from '@/server/disclosures';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET /api/flows — institutional flow (FII/DII, bulk & block deals,
 * shareholding) for the signed-in user.
 *
 * Query param: `watchlist=1` restricts deals and shareholding to followed names.
 * FII/DII is market-wide and always shown in full.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(request.url);
    const flow = await getInstitutionalFlow({
      watchlistOnly: url.searchParams.get('watchlist') === '1',
    });
    return ok(flow);
  });
}
