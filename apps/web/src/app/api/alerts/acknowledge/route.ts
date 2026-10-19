import type { NextResponse } from 'next/server';
import { acknowledgeUserAlertEvents } from '@/server/alerts';
import { handle, ok } from '@/server/watchlist-routes';

/** POST /api/alerts/acknowledge — mark every fired alert as seen. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  return handle(async () => ok({ acknowledged: await acknowledgeUserAlertEvents() }));
}
