import type { NextResponse } from 'next/server';
import { editEntrySchema, editPortfolioEntry, removePortfolioEntry } from '@/server/portfolio';
import { handle, jsonError, ok, parseBody, parseId } from '@/server/watchlist-routes';

/**
 * PATCH  /api/portfolio/entries/:id — correct an entry's date, shares and total amount.
 * DELETE /api/portfolio/entries/:id — remove one of the user's entries.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not an entry id.', 400, { code: 'INVALID_ID' });
    const body = await parseBody(request, editEntrySchema);
    if (!body.ok) return body.response;
    const outcome = await editPortfolioEntry(id, body.data);
    if (!outcome.ok) return jsonError(outcome.message, outcome.status, { code: outcome.code });
    return ok({ saved: true });
  });
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  return handle(async () => {
    const id = parseId((await params).id);
    if (id === null) return jsonError('Not an entry id.', 400, { code: 'INVALID_ID' });
    const outcome = await removePortfolioEntry(id);
    if (!outcome.ok) {
      return jsonError(outcome.message, outcome.status, { code: outcome.code });
    }
    return ok({ deleted: true });
  });
}
