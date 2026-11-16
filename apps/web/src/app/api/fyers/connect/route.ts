import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { jsonError } from '@/server/api-response';
import { requireAdminAccess } from '@/server/auth/guards';
import { toMarketError } from '@/server/errors';
import { providerAuthorisationUrl } from '@/server/provider';

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

export const OAUTH_STATE_COOKIE = 'provider_oauth_state';

/** Long enough to log in and pass 2FA, short enough not to linger. */
const STATE_TTL_SECONDS = 10 * 60;

export async function GET(): Promise<NextResponse> {
  // Admin only: completing this handshake replaces the shared market-data
  // credential for every user, and the edge middleware cannot tell a real
  // session from a made-up cookie.
  const denied = await requireAdminAccess();
  if (denied !== null) return denied;

  const state = randomBytes(16).toString('hex');
  let target: string;
  try {
    target = providerAuthorisationUrl(state);
  } catch (error) {
    const failure = toMarketError(error);
    return jsonError(failure.message, failure.status, {
      code: failure.code,
      ...(failure.remedy === undefined ? {} : { remedy: failure.remedy }),
    });
  }

  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
    // The callback arrives over http on localhost during development.
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.redirect(target, { status: 302 });
}
