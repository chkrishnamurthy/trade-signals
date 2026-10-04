import type { NextResponse } from 'next/server';
import { handle, jsonError, ok, parseBody, parseId } from '@/server/watchlist-routes';
import { addItemsSchema, removeItemsSchema, reorderItemsSchema } from '@/server/watchlist-schemas';
import { addSymbols, removeSymbols, reorderSymbols } from '@/server/watchlists';

/**
 * POST   /api/watchlists/:id/items — add symbols.
 * PUT    /api/watchlists/:id/items — rewrite member order.
 * DELETE /api/watchlists/:id/items — remove by instrument id.
 *
 * POST answers with what happened to each symbol — added, already there, or not
 * recognised — rather than a bare success. "Add" on a stock already in the list
 * is a thing users do constantly, and silently doing nothing reads as a bug.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

    const body = await parseBody(request, addItemsSchema);
    if (!body.ok) return body.response;

    return ok(await addSymbols(id, body.data.symbols));
  });
}

export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

    const body = await parseBody(request, reorderItemsSchema);
    if (!body.ok) return body.response;

    await reorderSymbols(id, body.data.instrumentIds);
    return ok({ reordered: true });
  });
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a watchlist id.', 400, { code: 'INVALID_ID' });

    const body = await parseBody(request, removeItemsSchema);
    if (!body.ok) return body.response;

    return ok({ removed: await removeSymbols(id, body.data.instrumentIds) });
  });
}
