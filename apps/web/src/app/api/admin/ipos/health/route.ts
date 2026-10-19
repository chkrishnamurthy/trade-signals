import type { NextResponse } from 'next/server';
import { getIpoAdminHealth } from '@/server/ipos';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET /api/admin/ipos/health — the IPO pipeline's operator view: feed health,
 * observations no issue claims, and official-source conflicts. Admin only
 * (403 otherwise); read-only.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok(await getIpoAdminHealth()));
}
