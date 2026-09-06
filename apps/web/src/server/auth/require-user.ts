import 'server-only';
import { type AuthUser, getSessionContext, touchSession } from '@equitywise/db';
import { getDatabase } from '@/server/db';
import { readSessionCookieValue } from './cookies';
import { authSessionSecret } from './env';
import { hashToken, readCookieValue, SESSION_IDLE_MS } from './session-token';

/**
 * The authoritative, revocable session check. Runs on the Node.js runtime (route
 * handlers and server components) — not the Edge middleware, which only checks
 * that a cookie is present.
 *
 * A session is valid only if ALL hold: the cookie's HMAC verifies; a matching row
 * exists (deleting it logs the user out instantly); it is within both the idle
 * and absolute lifetimes; it was created after the last password change; and the
 * account is active. Any failure ⇒ not authenticated.
 */

/** How stale `last_used_at` may get before we bother writing a refresh. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export async function getSessionUser(): Promise<AuthUser | null> {
  const cookie = await readSessionCookieValue();
  if (cookie === null) return null;

  const token = readCookieValue(cookie, authSessionSecret());
  if (token === null) return null;

  const tokenHash = hashToken(token);
  const db = getDatabase();
  const ctx = await getSessionContext(db, tokenHash);
  if (ctx === null) return null;

  const now = Date.now();
  const { session, user, passwordChangedAt } = ctx;

  if (session.expiresAt.getTime() <= now) return null; // absolute expiry
  if (now - session.lastUsedAt.getTime() > SESSION_IDLE_MS) return null; // idle timeout
  if (session.createdAt.getTime() < passwordChangedAt.getTime()) return null; // password changed since
  if (user.status !== 'active') return null;

  // Roll the idle timeout forward, but not on every single request.
  if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await touchSession(db, tokenHash);
  }

  return user;
}

/** The current admin, or null when not signed in as an admin. */
export async function getAdminUser(): Promise<AuthUser | null> {
  const user = await getSessionUser();
  return user !== null && user.role === 'admin' ? user : null;
}
