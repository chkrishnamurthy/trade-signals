import type { NextResponse } from 'next/server';
import { patchScreen, removeScreen } from '@/server/screener';
import { savedScreenPatchSchema } from '@/server/screener-schemas';
import { handle, jsonError, ok, parseBody, parseId } from '@/server/watchlist-routes';

/**
 * PATCH  /api/screener/screens/:id — rename or update one of the caller's screens.
 * DELETE /api/screener/screens/:id — remove it.
 * Another user's id answers 404, exactly like an id that does not exist.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a screen id.', 400, { code: 'INVALID_ID' });
    const body = await parseBody(request, savedScreenPatchSchema);
    if (!body.ok) return body.response;
    const screen = await patchScreen(id, body.data);
    if (screen === null)
      return jsonError('That screen no longer exists.', 404, { code: 'NOT_FOUND' });
    return ok(screen);
  });
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not a screen id.', 400, { code: 'INVALID_ID' });
    const removed = await removeScreen(id);
    if (!removed) return jsonError('That screen no longer exists.', 404, { code: 'NOT_FOUND' });
    return ok({ removed: true });
  });
}
