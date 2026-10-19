import type { NextResponse } from 'next/server';
import { saveSettings, settingsSchema } from '@/server/portfolio-notices';
import { handle, ok, parseBody } from '@/server/watchlist-routes';

/** PUT /api/portfolio/notices/settings — which holding notices the user gets, and their levels. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, settingsSchema);
    if (!body.ok) return body.response;
    return ok({ settings: await saveSettings(body.data) });
  });
}
