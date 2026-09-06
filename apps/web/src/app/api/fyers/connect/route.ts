import { randomBytes } from 'node:crypto';
import { authorizationUrl, readAuthConfig } from '@equitywise/providers-fyers';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { toMarketError } from '@/server/errors';

/**
 * GET /api/fyers/connect — bounces to the market-data provider's authorisation page.
 *
 * This is the Fyers OAuth handshake initiator, NOT a user-authentication route.
 * It was previously mounted at `/login`; that path is now reserved for the user
 * login page, so the provider handshake lives under `/api/fyers/*`. The redirect
 * target is still `/callback` (the URL registered in the Fyers developer
 * dashboard), which reads the state cookie set here.
 *
 * The `state` is generated here, stored in an httpOnly cookie, and compared in
 * /callback. Without that comparison the callback would accept any auth_code
 * anyone could get the browser to fetch, which is the whole point of the
 * parameter.
 *
 * Normally unused: the worker mints the Fyers token automatically each morning
 * (docs/operations/deployment.md §5). This browser handshake is the manual
 * fallback.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OAUTH_STATE_COOKIE = 'signal.oauth.state';

/** Long enough to log in and pass 2FA, short enough not to linger. */
const STATE_TTL_SECONDS = 10 * 60;

export async function GET(): Promise<NextResponse> {
  let config: ReturnType<typeof readAuthConfig>;
  try {
    config = readAuthConfig(process.env);
  } catch (error) {
    const failure = toMarketError(error);
    return NextResponse.json(
      { error: failure.message, code: failure.code, remedy: failure.remedy },
      { status: failure.status },
    );
  }

  const state = randomBytes(16).toString('hex');
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
    // The callback arrives over http on localhost during development.
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.redirect(authorizationUrl(config, state), { status: 302 });
}
