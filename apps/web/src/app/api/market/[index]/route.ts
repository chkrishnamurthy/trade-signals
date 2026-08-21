import { NextResponse } from 'next/server';
import type { MarketErrorDto, MarketSnapshotDto } from '@/lib/market-types';
import { getIndex, listIndexKeys } from '@/server/indices';
import { getMarketSnapshot, getStaleSnapshot, MarketDataError } from '@/server/market';

/**
 * GET /api/market/[index]
 *
 * `/api/market/nifty50` and `/api/market/banknifty` are both served from here;
 * the set of valid keys is whatever `config/indices.yaml` defines.
 *
 * Node runtime, never static: the response is live market data.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ index: string }> },
): Promise<NextResponse<MarketSnapshotDto | MarketErrorDto>> {
  const { index: key } = await context.params;

  const index = await getIndex(key);
  if (index === null) {
    return NextResponse.json<MarketErrorDto>(
      {
        error: `Unknown index "${key}".`,
        remedy: `Known indices: ${(await listIndexKeys()).join(', ')}. Add more in config/indices.yaml.`,
        code: 'UNKNOWN_INDEX',
      },
      { status: 404 },
    );
  }

  try {
    const snapshot = await getMarketSnapshot(index);
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const failure =
      error instanceof MarketDataError
        ? error
        : new MarketDataError(error instanceof Error ? error.message : String(error), {
            code: 'UNKNOWN',
            status: 500,
          });

    // A transient upstream failure should not blank the screen: if we have a
    // previous snapshot, serve it and let the UI flag it as stale.
    const stale = getStaleSnapshot(index.key);
    if (stale !== null && failure.code !== 'NOT_CONFIGURED' && failure.code !== 'TOKEN_EXPIRED') {
      return NextResponse.json(stale, {
        status: 200,
        headers: { 'Cache-Control': 'no-store', 'X-Stale-Reason': failure.code },
      });
    }

    return NextResponse.json<MarketErrorDto>(
      {
        error: failure.message,
        ...(failure.remedy === undefined ? {} : { remedy: failure.remedy }),
        code: failure.code,
      },
      { status: failure.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
