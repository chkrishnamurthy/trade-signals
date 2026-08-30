import { NextResponse } from 'next/server';
import { getBacktestDetail } from '@/server/backtests';
import { MarketDataError, toMarketError } from '@/server/errors';

/**
 * GET /api/backtests/[id] — one run, with every trade and its bucketed results.
 *
 * Separate from the list route because the trade array runs to hundreds of rows
 * per run; shipping them with the listing would multiply a page of headlines
 * into a page of payload.
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
      { error: `"${id}" is not a backtest run id.`, code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  try {
    const detail = await getBacktestDetail(numeric);
    if (detail.run === null) {
      return NextResponse.json(
        { error: 'That backtest run does not exist.', code: 'NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
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
