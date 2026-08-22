import { NextResponse } from 'next/server';
import { getDashboard, getStaleDashboard } from '@/server/dashboard';
import { canServeStale, MarketDataError, toMarketError } from '@/server/errors';

/** GET /api/dashboard/[index] — the fast path: two upstream calls, heavily cached. */
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

    const retryAfter =
      failure.retryAfterSeconds === undefined
        ? {}
        : { 'Retry-After': String(failure.retryAfterSeconds) };

    // A transient upstream blip should not blank the screen. An expired or
    // missing credential is not transient, so it surfaces as an error instead.
    const stale = getStaleDashboard(index);
    if (stale !== null && canServeStale(failure)) {
      return NextResponse.json(
        {
          ...stale,
          // The snapshot's own cadence assumes a healthy upstream. While we are
          // banned, polling at it just burns requests against a closed door, so
          // the deadline the provider gave us wins.
          ...(failure.retryAfterSeconds === undefined
            ? {}
            : { refreshAfterSeconds: failure.retryAfterSeconds }),
        },
        {
          headers: { 'Cache-Control': 'no-store', 'X-Stale-Reason': failure.code, ...retryAfter },
        },
      );
    }

    return NextResponse.json(
      {
        error: failure.message,
        ...(failure.remedy === undefined ? {} : { remedy: failure.remedy }),
        code: failure.code,
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      },
      { status: failure.status, headers: { 'Cache-Control': 'no-store', ...retryAfter } },
    );
  }
}
