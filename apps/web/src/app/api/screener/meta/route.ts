import type { NextResponse } from 'next/server';
import { handle, ok } from '@/server/api-response';
import { getScreenerMeta } from '@/server/screener';

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
