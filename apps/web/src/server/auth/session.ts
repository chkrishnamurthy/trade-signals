import 'server-only';
import { createSession, deleteAllSessionsForUser, deleteSession } from '@equitywise/db';
import { getDatabase } from '@/server/db';
import { clearSessionCookie, readSessionCookieValue, setSessionCookie } from './cookies';
import { authSessionSecret } from './env';
import { clientIp, userAgent } from './request';
import { generateSessionToken, hashToken, readCookieValue, SESSION_ABSOLUTE_MS } from './session-token';

/**
 * Session lifecycle. Creating a session mints a fresh token every time (so there
 * is no id to fixate on), stores only its hash, and sets the cookie. Ending one
 * deletes the row server-side — clearing the cookie alone would leave a stealable
 * session alive in the database.
 */

/** Start a new session for a user and set their cookie. Call after a successful login/signup. */
export async function startSession(userId: number, request: Request): Promise<void> {
  const token = generateSessionToken();
  await createSession(getDatabase(), {
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
  });
  await setSessionCookie(token);
}

/** End the current session (this device): delete the row and clear the cookie. */
export async function endCurrentSession(): Promise<void> {
  const cookie = await readSessionCookieValue();
  if (cookie !== null) {
    const token = readCookieValue(cookie, authSessionSecret());
    if (token !== null) await deleteSession(getDatabase(), hashToken(token));
  }
  await clearSessionCookie();
}

/** End every session for a user (all devices) and clear the current cookie. */
export async function endAllSessions(userId: number): Promise<void> {
  await deleteAllSessionsForUser(getDatabase(), userId);
  await clearSessionCookie();
}
