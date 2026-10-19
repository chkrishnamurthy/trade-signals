import type { NextResponse } from 'next/server';
import { clearPortfolio, getPortfolio } from '@/server/portfolio';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET    /api/portfolio — the signed-in user's holdings, valued at the last cached
 *                         price, with their entries. PRIVATE: never logged.
 * DELETE /api/portfolio — delete every entry the user has made.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok(await getPortfolio()));
}

export async function DELETE(): Promise<NextResponse> {
  return handle(async () => ok({ deleted: await clearPortfolio() }));
}
