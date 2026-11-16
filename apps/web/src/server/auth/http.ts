import 'server-only';
import type { NextResponse } from 'next/server';
import { jsonError as fail } from '../json-response';
import { IS_PROD, SESSION_COOKIE_NAME } from './cookie-config';

/**
 * JSON responses in the shape the client already renders (`{ error, code,
 * remedy? }`), always `no-store` — auth responses must never be cached. These
 * are the shared `ok` / `jsonError` under the names the auth routes use.
 */
export { jsonError as fail, ok as json } from '../json-response';

/**
 * Deletes a dead session cookie on a response.
 *
 * A revoked or expired session is still present in the browser as a cookie, and
 * the Edge middleware gate only checks for the cookie's *presence* — so it keeps
 * waving the user past the gate to a page whose data then 401s. Clearing the
 * cookie the moment the authoritative check rejects it makes the next hard
 * navigation redirect to `/login`, on every surface, not just the one that
 * happened to fetch. The attributes must match how the cookie was set (see
 * `cookies.ts`), or the browser keeps the old one.
 */
export function clearStaleSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export const unauthenticated = (): NextResponse =>
  clearStaleSessionCookie(
    fail('Not signed in.', 401, { code: 'UNAUTHENTICATED', remedy: 'Sign in and try again.' }),
  );
