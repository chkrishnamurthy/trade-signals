import 'server-only';
import { readSessionCookieValue } from '@/server/auth/cookies';
import { authSessionSecret } from '@/server/auth/env';
import { hashToken, readCookieValue } from '@/server/auth/session-token';

/**
 * The SHA-256 hash of the current request's session token — the same value
 * stored in `auth_sessions.token_hash`. Lets a route mark "this device" in the
 * session list and keep the current session when revoking the others. Null when
 * there is no valid session cookie.
 */
export async function currentSessionTokenHash(): Promise<string | null> {
  const cookie = await readSessionCookieValue();
  if (cookie === null) return null;
  const token = readCookieValue(cookie, authSessionSecret());
  if (token === null) return null;
  return hashToken(token);
}
