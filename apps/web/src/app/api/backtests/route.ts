import { NextResponse } from 'next/server';
import { getBacktestList } from '@/server/backtests';
import { MarketDataError, toMarketError } from '@/server/errors';

/**
 * GET /api/backtests — every stored backtest run, newest first.
 *
 * Cheap: one indexed read. It never runs the engine — runs are produced by
 * `pnpm backtest:intraday` and this only reads what was stored, the same
 * read-only boundary every other route in this app respects.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await getBacktestList(), {
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
