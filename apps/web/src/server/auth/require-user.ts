import 'server-only';
import { type AuthSession, type AuthUser, getSessionContext, touchSession } from '@equitywise/db';
import { getDatabase } from '@/server/db';
import { readCurrentSessionToken } from './session';
import { hashToken, SESSION_IDLE_MS } from './session-token';

/**
 * The authoritative, revocable session check. Runs on the Node.js runtime (route
 * handlers and server components) — not the Edge middleware, which only checks
 * that a cookie is present.
 *
 * A session is valid only if ALL hold: the token's HMAC verifies (cookie or Bearer); a matching row
 * exists (deleting it logs the user out instantly); it is within both the idle
 * and absolute lifetimes; its security version still matches the account; a
 * password-derived session predates no password change; and the account is active.
 */

/** How stale `last_used_at` may get before we bother writing a refresh. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export async function getSessionAuthContext(): Promise<{
  user: AuthUser;
  session: AuthSession;
} | null> {
  // Bearer header (the mobile app) first, then the browser cookie. Both carry
  // the same HMAC-signed token and pass exactly the same checks below.
  const token = await readCurrentSessionToken();
  if (token === null) return null;

  const tokenHash = hashToken(token);
  const db = getDatabase();
  const ctx = await getSessionContext(db, tokenHash);
  if (ctx === null) return null;

  const now = Date.now();
  const { session, user, passwordChangedAt } = ctx;

  if (session.expiresAt.getTime() <= now) return null; // absolute expiry
  if (now - session.lastUsedAt.getTime() > SESSION_IDLE_MS) return null; // idle timeout
  if (session.securityVersion !== user.securityVersion) return null;
  if (
    session.authenticationMethod === 'password' &&
    passwordChangedAt !== null &&
    session.createdAt.getTime() < passwordChangedAt.getTime()
  )
    return null;
  if (user.status !== 'active') return null;

  // Roll the idle timeout forward, but not on every single request.
  if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await touchSession(db, tokenHash);
  }

  return { user, session };
}

export async function getSessionUser(): Promise<AuthUser | null> {
  return (await getSessionAuthContext())?.user ?? null;
}

/** The current admin, or null when not signed in as an admin. */
export async function getAdminUser(): Promise<AuthUser | null> {
  const user = await getSessionUser();
  return user !== null && user.role === 'admin' ? user : null;
}
