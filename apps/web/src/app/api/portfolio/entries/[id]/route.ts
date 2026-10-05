import type { NextResponse } from 'next/server';
import { removePortfolioEntry } from '@/server/portfolio';
import { handle, jsonError, ok, parseId } from '@/server/watchlist-routes';

/** DELETE /api/portfolio/entries/:id — remove one of the user's entries. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

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
