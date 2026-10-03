import type { NextResponse } from 'next/server';
import { getScreenerMeta } from '@/server/screener';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET /api/screener/meta — the metric catalogue the caller may use (signal
 * metrics for admins only), presets, industries, snapshot sessions and the
 * caller's watchlists for the universe picker.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok(await getScreenerMeta()));
}
