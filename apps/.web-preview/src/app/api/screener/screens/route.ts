import type { NextResponse } from 'next/server';
import { getSavedScreens, saveScreen } from '@/server/screener';
import { savedScreenSchema } from '@/server/screener-schemas';
import { handle, ok, parseBody } from '@/server/watchlist-routes';

/**
 * GET  /api/screener/screens — the caller's saved screens.
 * POST /api/screener/screens — save a screen (owner-scoped; at most 50).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok({ screens: await getSavedScreens() }));
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, savedScreenSchema);
    if (!body.ok) return body.response;
    return ok(await saveScreen(body.data), 201);
  });
}
