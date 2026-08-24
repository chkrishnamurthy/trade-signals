import { NextResponse } from 'next/server';
import { canServeStale, MarketDataError, toMarketError } from '@/server/errors';
import { getMarketTicker, getStaleMarketTicker } from '@/server/ticker';

/**
 * GET /api/market/ticker — the global header's feed.
 *
 * Polled from every page, so it is deliberately the cheapest route in the app:
 * it reads the dashboard's server-side cache and returns a few hundred bytes.
 * The stale-serving behaviour mirrors `/api/dashboard/[index]` — a blip must
 * not blank the ticker across the whole application, but an expired credential
 * is not a blip and surfaces as an error.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getMarketTicker(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const failure = error instanceof MarketDataError ? error : toMarketError(error);

    const retryAfter =
      failure.retryAfterSeconds === undefined
        ? {}
        : { 'Retry-After': String(failure.retryAfterSeconds) };

    const stale = getStaleMarketTicker();
    if (stale !== null && canServeStale(failure)) {
      return NextResponse.json(
        {
          ...stale,
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
