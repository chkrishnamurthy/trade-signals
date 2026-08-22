import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getIntradayFeed } from '@/server/intraday-signals';

/**
 * GET /api/intraday-signals — the intraday trade-signal feed.
 *
 * Cheap: a handful of indexed reads against Postgres and one cached session
 * status. It never calls the market-data provider for bars, because the worker
 * has already done that and stored the result. Polling this at 30 seconds costs
 * nothing against the provider's rate limit.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getIntradayFeed(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const failure = error instanceof MarketDataError ? error : toMarketError(error);
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
