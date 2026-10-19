import type { NextResponse } from 'next/server';
import { requireAdminAccess } from '@/server/auth/guards';
import { eventLogQuerySchema, getEventLogPage } from '@/server/event-log';
import { handle, jsonError, ok } from '@/server/watchlist-routes';

/**
 * GET /api/admin/logs — the durable event log, newest first, filterable by category,
 * event, user and date, paginated with `beforeId`. Admin only and read-only: the
 * log is append-only and there is deliberately no way to edit or delete from here.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const denied = await requireAdminAccess();
    if (denied !== null) return denied;

    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = eventLogQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Bad filter.', 400, {
        code: 'INVALID_QUERY',
      });
    }
    return ok(await getEventLogPage(parsed.data));
  });
}
