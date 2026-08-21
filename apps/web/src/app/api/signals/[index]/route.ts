import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getSignals } from '@/server/signals';

/**
 * GET /api/signals/[index] — the slow path.
 *
 * Costs one Fyers history call per constituent, so it is cached by trading date
 * and deliberately requested on a much slower cadence than quotes.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ index: string }> },
): Promise<NextResponse> {
  const { index } = await context.params;
  try {
    return NextResponse.json(await getSignals(index), {
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
