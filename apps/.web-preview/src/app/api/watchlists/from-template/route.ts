import type { NextResponse } from 'next/server';
import { handle, jsonError, ok, parseBody } from '@/server/watchlist-routes';
import { fromTemplateSchema } from '@/server/watchlist-schemas';
import { createFromTemplate } from '@/server/watchlist-templates';

/**
 * POST /api/watchlists/from-template — create a watchlist from a starter list.
 *
 * One call creates the list AND fills it, so a browser that closes between
 * the two cannot leave an empty "NIFTY 50" behind. Answers with the new list's
 * summary and how many names went in.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, fromTemplateSchema);
    if (!body.ok) return body.response;

    const result = await createFromTemplate(body.data.templateId, body.data.name);
    if (result === null) return jsonError('No such starter list.', 404, { code: 'NOT_FOUND' });
    return ok(result, 201);
  });
}
