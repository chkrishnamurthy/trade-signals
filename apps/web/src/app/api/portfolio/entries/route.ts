import type { NextResponse } from 'next/server';
import { addEntrySchema, addPortfolioEntry } from '@/server/portfolio';
import { handle, jsonError, ok, parseBody } from '@/server/watchlist-routes';

/** POST /api/portfolio/entries — add one entry by hand. Prices are integer paise. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, addEntrySchema);
    if (!body.ok) return body.response;
    const outcome = await addPortfolioEntry(body.data);
    if (!outcome.ok) {
      return jsonError(outcome.message, outcome.status, {
        code: outcome.code,
        ...(outcome.remedy === undefined ? {} : { remedy: outcome.remedy }),
      });
    }
    return ok({ saved: true }, 201);
  });
}
