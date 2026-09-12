import type { NextResponse } from 'next/server';
import { getAnnouncementsPage } from '@/server/disclosures';
import { handle, ok } from '@/server/watchlist-routes';

/**
 * GET /api/announcements — corporate announcements for the signed-in user.
 *
 * Query params: `watchlist=1` to restrict to followed names, `category=` (may
 * repeat) to filter, `page=` for pagination. Thin: auth via middleware +
 * service, logic in the server layer, shared error shape via `handle`.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(request.url);
    const pageParam = Number(url.searchParams.get('page') ?? '1');
    const categories = url.searchParams.getAll('category').filter((c) => c !== '');

    const brief = await getAnnouncementsPage({
      watchlistOnly: url.searchParams.get('watchlist') === '1',
      ...(categories.length > 0 ? { categories } : {}),
      page: Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1,
    });
    return ok(brief);
  });
}
