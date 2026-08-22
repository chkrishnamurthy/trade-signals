import { NextResponse } from 'next/server';
import { MarketDataError, toMarketError } from '@/server/errors';
import { getIntradaySignal } from '@/server/intraday-signals';

/**
 * GET /api/intraday-signals/[id] — one signal with its full timeline.
 *
 * The timeline is the reason this route exists separately: it can run to
 * dozens of entries per signal, and shipping every one of them with the list
 * would multiply the feed payload for data only ever read one signal at a time.
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
    const signal = await getIntradaySignal(numeric);
    if (signal === null) {
      return NextResponse.json(
        { error: 'That signal does not exist.', code: 'NOT_FOUND' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(signal, { headers: { 'Cache-Control': 'no-store' } });
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
