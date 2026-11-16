import type { Resolution } from '@equitywise/market-data';
import { NextResponse } from 'next/server';
import { jsonError } from '@/server/api-response';
import { unauthenticated } from '@/server/auth/http';
import { limitByUser } from '@/server/auth/request-limit';
import { getSessionUser } from '@/server/auth/require-user';
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

const HISTORY_LIMIT = { max: 120, windowMs: 60_000 } as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (user === null) return unauthenticated();
  // Every chart load can reach the shared market-data provider. A person
  // flipping through stocks and timeframes stays far below this; a script does not.
  const limited = limitByUser(user.id, 'history', HISTORY_LIMIT);
  if (limited !== null) return limited;

  const { symbol } = await context.params;
  const timeframe = new URL(request.url).searchParams.get('tf') ?? '1D';
  const spec = TIMEFRAMES[timeframe];

  if (spec === undefined) {
    return jsonError(`Unknown timeframe "${timeframe}".`, 400, {
      code: 'BAD_TIMEFRAME',
      remedy: `Use one of ${Object.keys(TIMEFRAMES).join(', ')}.`,
    });
  }

  const resolved = await resolveSymbol(symbol);
  if (resolved === null) {
    return jsonError(`Unknown symbol "${symbol}".`, 404, { code: 'UNKNOWN_SYMBOL' });
  }

  try {
    const now = new Date();
    const fetched = await getBars(
      {
        ref: { symbol: resolved.symbol, kind: resolved.kind },
        resolution: spec.resolution,
        from: new Date(now.getTime() - spec.days * 86_400_000),
        to: now,
        // Intraday charts show the forming bar; only stored indicators and
        // screener metrics require closed-only bars.
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
    return jsonError(failure.message, failure.status, {
      code: failure.code,
      ...(failure.remedy ? { remedy: failure.remedy } : {}),
    });
  }
}
