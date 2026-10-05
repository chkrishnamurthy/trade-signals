import type { NextResponse } from 'next/server';
import { createAlertSchema, createUserAlert, getAlertsOverview } from '@/server/alerts';
import { handle, jsonError, ok, parseBody } from '@/server/watchlist-routes';

/**
 * GET  /api/alerts — the signed-in user's rules, recent events and the limit.
 * POST /api/alerts — create a rule: a stock, a metric (close or RSI), a crossing
 *                    direction and a level. Prices are integer paise.
 *
 * A rule is judged on each CLOSED daily session, never on a live price.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handle(async () => ok(await getAlertsOverview()));
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await parseBody(request, createAlertSchema);
    if (!body.ok) return body.response;
    const outcome = await createUserAlert(body.data);
    if (!outcome.ok) {
      return jsonError(outcome.message, outcome.status, {
        code: outcome.code,
        ...(outcome.remedy === undefined ? {} : { remedy: outcome.remedy }),
      });
    }
    return ok({ id: outcome.id }, 201);
  });
}
