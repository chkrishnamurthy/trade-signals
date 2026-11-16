import type { NextResponse } from 'next/server';
import { handle, ok } from '@/server/api-response';
import { getNotices } from '@/server/portfolio-notices';

/** GET /api/portfolio/notices — the signed-in user's notices about their holdings, and settings. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok(await getNotices()));
}
