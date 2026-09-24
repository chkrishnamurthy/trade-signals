import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/require-user';
import { getStockDetail } from '@/server/stock-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stocks/[symbol] — one stock's end-of-day picture for the mobile
 * stock-detail screen (docs/mobile/01-discovery.md G6): last close and range,
 * 52-week band, the indicator snapshot, recent corporate actions and sector
 * peers. Prices are integer paise; nothing here is recomputed on the client.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  if ((await getSessionUser()) === null) {
    return NextResponse.json(
      { error: 'Not signed in.', code: 'UNAUTHENTICATED', remedy: 'Sign in and try again.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const { symbol } = await context.params;
  if (!/^[A-Za-z0-9&._-]{1,40}$/u.test(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol.', code: 'BAD_SYMBOL' }, { status: 400 });
  }
  const detail = await getStockDetail(decodeURIComponent(symbol));
  if (detail === null) {
    return NextResponse.json(
      { error: `Unknown symbol "${symbol}".`, code: 'UNKNOWN_SYMBOL' },
      { status: 404 },
    );
  }
  return NextResponse.json({ stock: detail }, { headers: { 'Cache-Control': 'no-store' } });
}
