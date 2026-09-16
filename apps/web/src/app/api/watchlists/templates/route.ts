import type { NextResponse } from 'next/server';
import { handle, ok } from '@/server/watchlist-routes';
import { listTemplates } from '@/server/watchlist-templates';

/** GET /api/watchlists/templates — the starter lists, from `config/indices.yaml`. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok({ templates: await listTemplates() }));
}
