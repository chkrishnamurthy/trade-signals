import { NextResponse } from 'next/server';
import { FIFO_NOTE_COOKIE } from '@/lib/portfolio-prefs';
import { fail, unauthenticated } from '@/server/auth/http';
import { isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';

/**
 * POST /api/portfolio/prefs/fifo-note — remembers that the one-time "average cost
 * uses oldest purchases first" note was dismissed, in a cookie the portfolio page
 * reads on the server (so the note is in the first paint or not at all). The
 * cookie holds no portfolio data.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  }
  if ((await getSessionUser()) === null) {
    return unauthenticated();
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(FIFO_NOTE_COOKIE, '1', {
    path: '/portfolio',
    maxAge: 31_536_000,
    sameSite: 'lax',
    secure: new URL(request.url).protocol === 'https:',
    httpOnly: true,
  });
  return response;
}
