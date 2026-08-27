import { randomBytes } from 'node:crypto';
import { authorizationUrl, readAuthConfig } from '@equitywise/providers-fyers';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { toMarketError } from '@/server/errors';

/**
 * GET /login — bounces to the data provider's authorisation page.
 *
 * The `state` is generated here, stored in an httpOnly cookie, and compared in
 * /callback. Without that comparison the callback would accept any auth_code
 * anyone could get the browser to fetch, which is the whole point of the
 * parameter.
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
