import type { NextResponse } from 'next/server';
import { handle, jsonError, ok, parseBody, parseId } from '@/server/watchlist-routes';
import { layoutSchema } from '@/server/watchlist-schemas';
import { saveLayout } from '@/server/watchlists';

/**
 * PUT /api/watchlists/:id/layout — persist columns, sort and filters.
 *
 * A whole-layout write rather than field-level patches. The three move together
 * — applying a quick view changes all of them at once — and a partial write
 * would let a saved sort reference a column the same save had just hidden.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

    const body = await parseBody(request, layoutSchema);
    if (!body.ok) return body.response;

    await saveLayout(id, body.data);
    return ok({ saved: true });
  });
}
