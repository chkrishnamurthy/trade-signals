import type { NextResponse } from 'next/server';
import { getMarketBrief } from '@/server/market-brief';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET /api/market-brief/latest — the Daily Market Brief for the signed-in user.
 *
 * Thin by design (see the `api-boundary` skill): auth is enforced by the
 * middleware plus `getMarketBrief`'s own owner check, the business logic lives
 * in the server service, and failures surface through the shared error shape
 * that `handle` produces. Reads only previously-persisted data, so it renders
 * safely even when Fyers is unavailable.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const { brief, defaultWatchlistId } = await getMarketBrief();
    return ok({ brief, defaultWatchlistId });
  });
}
