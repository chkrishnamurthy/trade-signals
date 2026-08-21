import type { Resolution } from '@signal/market-data';
import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getBars } from '@/server/history';
import { resolveSymbol } from '@/server/search';

/**
 * GET /api/history/[symbol]?tf=1D — chart data.
 *
 * Timeframes map to a (resolution, lookback) pair chosen so each request stays
 * inside typical provider per-request range limits: ~100 days for minute
 * resolutions, ~366 for daily. The adapter chunks anything larger.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEFRAMES: Record<string, { resolution: Resolution; days: number }> = {
  '1D': { resolution: '5m', days: 5 },
  '5D': { resolution: '15m', days: 9 },
  '1M': { resolution: '1h', days: 34 },
  '3M': { resolution: '1d', days: 95 },
  '6M': { resolution: '1d', days: 190 },
  '1Y': { resolution: '1d', days: 370 },
  '5Y': { resolution: '1d', days: 1830 },
};

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  const { symbol } = await context.params;
  const timeframe = new URL(request.url).searchParams.get('tf') ?? '1D';
  const spec = TIMEFRAMES[timeframe];

  if (spec === undefined) {
    return NextResponse.json(
      {
        error: `Unknown timeframe "${timeframe}".`,
        remedy: `Use one of ${Object.keys(TIMEFRAMES).join(', ')}.`,
        code: 'BAD_TIMEFRAME',
      },
      { status: 400 },
    );
  }

  const resolved = await resolveSymbol(symbol);
  if (resolved === null) {
    return NextResponse.json(
      { error: `Unknown symbol "${symbol}".`, code: 'UNKNOWN_SYMBOL' },
      { status: 404 },
    );
  }

  try {
    const now = new Date();
    const bars = await getBars(
      {
        ref: { symbol: resolved.symbol, kind: resolved.kind },
        resolution: spec.resolution,
        from: new Date(now.getTime() - spec.days * 86_400_000),
        to: now,
        // Intraday charts show the forming bar; only the signal engine
        // requires closed-only bars.
        includeForming: spec.resolution !== '1d',
      },
      now,
    );

    return NextResponse.json(
      {
        symbol: resolved.symbol,
        name: resolved.name,
        timeframe,
        resolution: spec.resolution,
        bars: bars.map((b) => ({
          t: b.timestamp,
          o: b.open,
          h: b.high,
          l: b.low,
          c: b.close,
          v: b.volume,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const failure = error instanceof MarketDataError ? error : toMarketError(error);
    return NextResponse.json(
      {
        error: failure.message,
        code: failure.code,
        ...(failure.remedy ? { remedy: failure.remedy } : {}),
      },
      { status: failure.status },
    );
  }
}
