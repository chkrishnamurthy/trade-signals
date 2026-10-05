import 'server-only';
import type { AuthUser } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, unauthenticated } from './http';
import { getSessionUser } from './require-user';

/**
 * Route-level guards for handlers that do not already authenticate through a
 * server module (`requireOwnerId`, `getAdminUser`, …).
 *
 * The Edge middleware only checks that a session cookie is *present*, so a
 * made-up cookie passes it. Any route that spends provider budget or returns
 * market data must therefore run one of these, which does the authoritative
 * check (HMAC, DB row, expiry, account status).
 *
 * Each returns the response to send when access is denied, or null to proceed:
 *
 *   const denied = await requireSignedIn();
 *   if (denied !== null) return denied;
 */

/** 401 (and clears the dead cookie) unless there is a valid session. */
export async function requireSignedIn(): Promise<NextResponse | null> {
  return (await getSessionUser()) === null ? unauthenticated() : null;
}

/** 401 when signed out, 403 when signed in but not an admin. */
export async function requireAdminAccess(): Promise<NextResponse | null> {
  return (await requireAdminUser()).denied;
}

/** The current admin user, or the exact denial response the route should return. */
export async function requireAdminUser(): Promise<
  | { readonly user: AuthUser; readonly denied: null }
  | { readonly user: null; readonly denied: NextResponse }
> {
  const user = await getSessionUser();
  if (user === null) return { user: null, denied: unauthenticated() };
  if (user.role !== 'admin') {
    return {
      user: null,
      denied: fail('Admin access required.', 403, { code: 'FORBIDDEN' }),
    };
  }
  return { user, denied: null };
}
