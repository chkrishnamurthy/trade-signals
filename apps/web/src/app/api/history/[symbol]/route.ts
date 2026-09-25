import type { Resolution } from '@equitywise/market-data';
import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getBars, latestSession } from '@/server/history';
import { resolveSymbol } from '@/server/search';

/**
 * GET /api/history/[symbol]?tf=1D — chart data.
 *
 * Timeframes map to a (resolution, lookback) pair chosen so each request stays
 * inside typical provider per-request range limits: ~100 days for minute
 * resolutions, ~366 for daily. The adapter chunks anything larger.
 *
 * `1D` is one trading session at minute resolution, so the chart's cursor
 * steps 10:00, 10:01, 10:02. Its lookback is still a few calendar days so that
 * a long weekend or a holiday still finds the last session; the response is
 * then trimmed to that session (375 bars at most) and carries its fixed
 * 09:15-15:30 window, which the chart draws against so a live session reads
 * as partly filled.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEFRAMES: Record<string, { resolution: Resolution; days: number; session?: true }> = {
  '1D': { resolution: '1m', days: 5, session: true },
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
    const fetched = await getBars(
      {
        ref: { symbol: resolved.symbol, kind: resolved.kind, exchange: resolved.exchange },
        resolution: spec.resolution,
        from: new Date(now.getTime() - spec.days * 86_400_000),
        to: now,
        // Intraday charts show the forming bar; only the signal engine
        // requires closed-only bars.
        includeForming: spec.resolution !== '1d',
      },
      now,
    );
    const trimmed = spec.session === true ? latestSession(fetched) : null;
    const bars = trimmed?.bars ?? fetched;

    return NextResponse.json(
      {
        symbol: resolved.symbol,
        name: resolved.name,
        timeframe,
        resolution: spec.resolution,
        ...(trimmed === null ? {} : { session: trimmed.session }),
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
