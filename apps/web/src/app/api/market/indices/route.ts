import { NextResponse } from 'next/server';
import { clearStaleSessionCookie } from '@/server/auth/http';
import { canServeStale, MarketDataError, toMarketError } from '@/server/errors';
import { getIndexStrip, getStaleIndexStrip } from '@/server/index-strip';

/**
 * GET /api/market/indices — the market indices strip's snapshot.
 *
 * Requested by every signed-in page, so it reads a process-wide cache and
 * returns a few hundred bytes. A provider blip serves the last good snapshot
 * with `stale` set and `X-Stale-Reason` — the strip must not vanish from the
 * top of every page over a hiccup. An expired credential is not a blip and
 * surfaces as the error it is.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getIndexStrip(), { headers: NO_STORE });
  } catch (error) {
    const failure = error instanceof MarketDataError ? error : toMarketError(error);
    const retryAfter =
      failure.retryAfterSeconds === undefined
        ? {}
        : { 'Retry-After': String(failure.retryAfterSeconds) };

    const stale = canServeStale(failure) ? getStaleIndexStrip(failure.code) : null;
    if (stale !== null) {
      return NextResponse.json(stale, {
        headers: { ...NO_STORE, 'X-Stale-Reason': failure.code, ...retryAfter },
      });
    }

    const response = NextResponse.json(
      {
        error: failure.message,
        code: failure.code,
        ...(failure.remedy === undefined ? {} : { remedy: failure.remedy }),
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      },
      { status: failure.status, headers: { ...NO_STORE, ...retryAfter } },
    );
    return failure.status === 401 ? clearStaleSessionCookie(response) : response;
  }
}
