import type { NextResponse } from 'next/server';
import { markRead, markReadSchema } from '@/server/portfolio-notices';
import { handle, ok, parseBody } from '@/server/watchlist-routes';

/** POST /api/portfolio/notices/read — marks the given notices read, or all when no ids are given. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, markReadSchema);
    if (!body.ok) return body.response;
    return ok({ marked: await markRead(body.data) });
  });
}
