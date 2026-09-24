import 'server-only';
import { createSession, deleteAllSessionsForUser, deleteSession } from '@equitywise/db';
import { headers } from 'next/headers';
import { getDatabase } from '@/server/db';
import { bearerToken, isNativeClient } from './client';
import { clearSessionCookie, readSessionCookieValue, setSessionCookie } from './cookies';
import { authSessionSecret } from './env';
import { clientIp, userAgent } from './request';
import {
  generateSessionToken,
  hashToken,
  readCookieValue,
  SESSION_ABSOLUTE_MS,
  signCookieValue,
} from './session-token';

/**
 * Session lifecycle. Creating a session mints a fresh token every time (so there
 * is no id to fixate on), stores only its hash, and sets the cookie. Ending one
 * deletes the row server-side — clearing the cookie alone would leave a stealable
 * session alive in the database.
 */

export interface StartSessionOptions {
  readonly securityVersion?: number;
  readonly authenticationMethod?: 'password' | 'google';
  readonly authIdentityId?: number | null;
  readonly mfaVerifiedAt?: Date | null;
  /** Device label the app sent (`device.name`); ignored for browsers. */
  readonly deviceName?: string | null;
}

/**
 * A freshly issued session. For a browser it is already in the cookie and
 * `bearer` is null. For the native app no cookie is set: `bearer` carries the
 * signed token, which the route returns in the body (see `sessionBody`) and the
 * app keeps in the Android Keystore.
 */
export interface IssuedSession {
  readonly bearer: string | null;
  readonly expiresAt: Date;
}

/**
 * Start a new session for a user. Call after a successful login/signup. Browsers
 * get the cookie; the native app (detected by its client header) gets a bearer
 * token instead — same row, same token entropy, same validation on every request.
 */
export async function startSession(
  userId: number,
  request: Request,
  options: StartSessionOptions = {},
): Promise<IssuedSession> {
  const token = generateSessionToken();
  const native = isNativeClient(request.headers);
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);
  await createSession(getDatabase(), {
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
    securityVersion: options.securityVersion ?? 0,
    authenticationMethod: options.authenticationMethod ?? 'password',
    authIdentityId: options.authIdentityId ?? null,
    authenticatedAt: new Date(),
    mfaVerifiedAt: options.mfaVerifiedAt ?? null,
    reauthenticatedAt: new Date(),
    client: native ? 'mobile' : 'web',
    deviceName: native ? cleanDeviceName(options.deviceName) : null,
  });
  if (native) return { bearer: signCookieValue(token, authSessionSecret()), expiresAt };
  await setSessionCookie(token);
  return { bearer: null, expiresAt };
}

/** The JSON fields a sign-in response adds for the native app; empty for browsers. */
export function sessionBody(
  issued: IssuedSession,
): { session: { token: string; expiresAt: string } } | Record<string, never> {
  return issued.bearer === null
    ? {}
    : { session: { token: issued.bearer, expiresAt: issued.expiresAt.toISOString() } };
}

function cleanDeviceName(name: string | null | undefined): string | null {
  // Printable characters only: this label is shown back in the sessions list.
  const trimmed = [...(name ?? '')]
    .filter((ch) => ch >= ' ' && ch !== '\u007f')
    .join('')
    .trim()
    .slice(0, 80);
  return trimmed ? trimmed : null;
}

/** The current request's session token — Bearer header first, then the cookie. */
export async function readCurrentSessionToken(): Promise<string | null> {
  const raw = bearerToken(await headers()) ?? (await readSessionCookieValue());
  return raw === null ? null : readCookieValue(raw, authSessionSecret());
}

/** End the current session (this device): delete the row and clear the cookie. */
export async function endCurrentSession(): Promise<void> {
  const bearer = bearerToken(await headers());
  if (bearer !== null) {
    const token = readCookieValue(bearer, authSessionSecret());
    if (token !== null) await deleteSession(getDatabase(), hashToken(token));
    return;
  }
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
