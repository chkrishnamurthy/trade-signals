import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getStocks } from '@/server/stocks';

/**
 * GET /api/stocks — every tracked constituent, once, with its sector.
 *
 * The fast half of the stocks page. Composed from the per-index dashboard
 * snapshots, so it costs nothing beyond what those already fetched and it
 * inherits their market-open / market-closed poll interval via
 * `refreshAfterSeconds`.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getStocks(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const failure = error instanceof MarketDataError ? error : toMarketError(error);
    return NextResponse.json(
      {
        error: failure.message,
        ...(failure.remedy === undefined ? {} : { remedy: failure.remedy }),
        code: failure.code,
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      },
      { status: failure.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
