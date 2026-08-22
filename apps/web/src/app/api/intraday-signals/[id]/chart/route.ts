import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getSignalChart } from '@/server/intraday-signals';

/**
 * GET /api/intraday-signals/[id]/chart — the session chart behind one signal.
 *
 * Bars and overlays are computed server-side from stored candles using the
 * same pure functions the engine used, so the chart shows what the engine saw.
 * Recomputing a VWAP in the browser could produce a different line from the one
 * the signal was scored against, with nothing on screen to say which was real.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const numeric = Number(id);

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return NextResponse.json(
      { error: `"${id}" is not a signal id.`, code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  try {
    const chart = await getSignalChart(numeric);
    if (chart === null) {
      return NextResponse.json(
        { error: 'No chart data for that signal.', code: 'NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(chart, { headers: { 'Cache-Control': 'no-store' } });
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
