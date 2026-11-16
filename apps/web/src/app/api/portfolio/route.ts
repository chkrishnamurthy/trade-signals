import type { NextResponse } from 'next/server';
import { handle, ok } from '@/server/api-response';
import { clearPortfolio, getPortfolio } from '@/server/portfolio';

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
