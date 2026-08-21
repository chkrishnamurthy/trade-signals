import type { FyersResolution } from '@signal/fyers';
import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getBars } from '@/server/history';
import { resolveSymbol } from '@/server/search';

/**
 * GET /api/history/[symbol]?tf=1D — chart data.
 *
 * Timeframes map to a (resolution, lookback) pair chosen so each request stays
 * inside Fyers' documented per-request range limits: 100 days for minute
 * resolutions, 366 for daily.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEFRAMES: Record<string, { resolution: FyersResolution; days: number }> = {
  '1D': { resolution: '5', days: 5 },
  '5D': { resolution: '15', days: 9 },
  '1M': { resolution: '60', days: 34 },
  '3M': { resolution: 'D', days: 95 },
  '6M': { resolution: 'D', days: 190 },
  '1Y': { resolution: 'D', days: 370 },
  '5Y': { resolution: 'D', days: 1830 },
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
        fyersSymbol: resolved.fyersSymbol,
        resolution: spec.resolution,
        from: new Date(now.getTime() - spec.days * 86_400_000),
        to: now,
        // Intraday charts show the forming candle; only the signal engine
        // requires closed-only bars.
        closedOnly: spec.resolution === 'D',
      },
      now,
    );

    return NextResponse.json(
      {
        symbol: resolved.symbol,
        name: resolved.name,
        fyersSymbol: resolved.fyersSymbol,
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
