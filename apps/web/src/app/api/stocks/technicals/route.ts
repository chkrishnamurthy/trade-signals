import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getStockTechnicals } from '@/server/stocks';

/**
 * GET /api/stocks/technicals — daily indicators for every tracked constituent.
 *
 * The slow half of the stocks page: one history call per symbol behind a
 * fifteen-minute cache. Kept off `/api/stocks` so the table renders on the
 * quote feed alone and fills in when this lands, rather than showing nothing
 * for as long as the indicator pass takes.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getStockTechnicals(), {
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
