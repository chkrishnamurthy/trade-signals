import { NextResponse } from 'next/server';
import { getDashboard, getStaleDashboard } from '@/server/dashboard';
import { MarketDataError, toMarketError } from '@/server/errors';

/** GET /api/dashboard/[index] — the fast path: two Fyers calls, heavily cached. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ index: string }> },
): Promise<NextResponse> {
  const { index } = await context.params;
  try {
    return NextResponse.json(await getDashboard(index), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const failure = error instanceof MarketDataError ? error : toMarketError(error);

    // A transient upstream blip should not blank the screen.
    const stale = getStaleDashboard(index);
    if (stale !== null && failure.code !== 'NOT_CONFIGURED' && failure.code !== 'TOKEN_EXPIRED') {
      return NextResponse.json(stale, {
        headers: { 'Cache-Control': 'no-store', 'X-Stale-Reason': failure.code },
      });
    }

    return NextResponse.json(
      {
        error: failure.message,
        ...(failure.remedy === undefined ? {} : { remedy: failure.remedy }),
        code: failure.code,
      },
      { status: failure.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
