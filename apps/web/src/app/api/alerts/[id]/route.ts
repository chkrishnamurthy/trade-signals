import type { NextResponse } from 'next/server';
import { removeUserAlert, setUserAlertEnabled, updateAlertSchema } from '@/server/alerts';
import { handle, jsonError, ok, parseBody, parseId } from '@/server/watchlist-routes';

/**
 * PATCH  /api/alerts/:id — switch a rule on or off.
 * DELETE /api/alerts/:id — remove it and its history.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not an alert id.', 400, { code: 'INVALID_ID' });
    const body = await parseBody(request, updateAlertSchema);
    if (!body.ok) return body.response;
    if (!(await setUserAlertEnabled(id, body.data.enabled))) {
      return jsonError('That alert no longer exists.', 404, { code: 'NOT_FOUND' });
    }
    return ok({ updated: true });
  });
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not an alert id.', 400, { code: 'INVALID_ID' });
    if (!(await removeUserAlert(id))) {
      return jsonError('That alert no longer exists.', 404, { code: 'NOT_FOUND' });
    }
    return ok({ deleted: true });
  });
}
