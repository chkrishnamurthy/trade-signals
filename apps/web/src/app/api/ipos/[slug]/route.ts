import type { NextResponse } from 'next/server';
import { ipoSlugSchema } from '@/server/ipo-schemas';
import { getIpoDetail } from '@/server/ipos';
import { handle, jsonError, ok } from '@/server/watchlist-routes';

/**
 * GET /api/ipos/:slug — one issue in full: facts with per-field sources,
 * timeline, subscription, documents, listing performance, the UNOFFICIAL GMP
 * panel and its track record. 404 for an unknown slug.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  return handle(async () => {
    const { slug } = await params;
    const parsed = ipoSlugSchema.safeParse(slug);
    if (!parsed.success) return jsonError('IPO not found.', 404, { code: 'NOT_FOUND' });
    return ok(await getIpoDetail(parsed.data));
  });
}
