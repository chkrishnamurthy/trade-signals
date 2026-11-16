import type { NextResponse } from 'next/server';
import { handle, ok } from '@/server/api-response';
import { getUnreadNoticeCount } from '@/server/portfolio-notices';

/** GET /api/portfolio/notices/count — unread notices for the header; 0 when signed out. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok({ unread: await getUnreadNoticeCount() }));
}
