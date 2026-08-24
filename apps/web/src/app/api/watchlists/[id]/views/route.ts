import type { NextResponse } from 'next/server';
import { handle, jsonError, ok, parseBody, parseId } from '@/server/watchlist-routes';
import { saveViewSchema } from '@/server/watchlist-schemas';
import { saveView } from '@/server/watchlists';

/**
 * POST /api/watchlists/:id/views — save the current configuration by name.
 *
 * `global: true` stores it with no watchlist, which makes it available on every
 * list — the difference between "my columns for this sector list" and "my
 * columns, generally".
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

    const body = await parseBody(request, saveViewSchema);
    if (!body.ok) return body.response;

    const view = await saveView({
      watchlistId: body.data.global === true ? null : id,
      name: body.data.name,
      columns: body.data.columns,
      sort: body.data.sort,
      filters: body.data.filters,
    });
    return ok({ view }, 201);
  });
}
