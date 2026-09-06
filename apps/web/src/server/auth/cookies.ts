import 'server-only';
import { cookies } from 'next/headers';
import { IS_PROD, SESSION_COOKIE_NAME } from './cookie-config';
import { authSessionSecret } from './env';
import { SESSION_ABSOLUTE_MS, signCookieValue } from './session-token';

/**
 * Reading and writing the session cookie. `HttpOnly` keeps it out of reach of any
 * XSS; `Secure` (production) keeps it off plaintext HTTP; `SameSite=Lax` lets a
 * top-level navigation carry it while blocking cross-site POSTs. The value is the
 * HMAC-signed token (see session-token.ts).
 */

const BASE = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: 'lax',
  path: '/',
} as const;

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, signCookieValue(token, authSessionSecret()), {
    ...BASE,
    maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, '', { ...BASE, maxAge: 0 });
}

export async function readSessionCookieValue(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE_NAME)?.value ?? null;
}
