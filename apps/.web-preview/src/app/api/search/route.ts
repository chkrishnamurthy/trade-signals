import { NextResponse } from 'next/server';
import { toMarketError } from '@/server/errors';
import { searchSymbols } from '@/server/search';

/** GET /api/search?q=reliance — symbol lookup from the Fyers symbol master. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  if (query.trim().length === 0) return NextResponse.json({ results: [] });

  try {
    return NextResponse.json(
      { results: await searchSymbols(query) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const failure = toMarketError(error);
    return NextResponse.json(
      { error: failure.message, code: failure.code },
      { status: failure.status },
    );
  }
}
