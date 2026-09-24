import 'server-only';
import { readCurrentSessionToken } from '@/server/auth/session';
import { hashToken } from '@/server/auth/session-token';

/**
 * The SHA-256 hash of the current request's session token — the same value
 * stored in `auth_sessions.token_hash`. Lets a route mark "this device" in the
 * session list and keep the current session when revoking the others. Null when
 * there is no valid session token (Bearer header or cookie).
 */
export async function currentSessionTokenHash(): Promise<string | null> {
  const token = await readCurrentSessionToken();
  return token === null ? null : hashToken(token);
}
