import type { NextResponse } from 'next/server';
import {
  getRatioLayoutForViewer,
  resetRatioLayoutForViewer,
  saveRatioLayoutForViewer,
} from '@/server/ratio-layout';
import { ratioLayoutSchema } from '@/server/screener-schemas';
import { handle, ok, parseBody } from '@/server/watchlist-routes';

/**
 * GET    /api/stocks/ratio-layout — the caller's ratio board tiles (or the default).
 * PUT    /api/stocks/ratio-layout — replace them: `{ keys: string[] }`, 3–30, unique.
 * DELETE /api/stocks/ratio-layout — back to the default. `?fno=1` picks the F&O default.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fno(request: Request): boolean {
  return new URL(request.url).searchParams.get('fno') === '1';
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => ok(await getRatioLayoutForViewer(fno(request))));
}

export async function PUT(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, ratioLayoutSchema);
    if (!body.ok) return body.response;
    return ok(await saveRatioLayoutForViewer(body.data.keys));
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  return handle(async () => ok(await resetRatioLayoutForViewer(fno(request))));
}
