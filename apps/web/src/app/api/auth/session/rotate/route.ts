import { rotateSessionToken, writeAudit } from '@equitywise/db';
import { headers } from 'next/headers';
import type { NextResponse } from 'next/server';
import { bearerToken, nativeClientLabel } from '@/server/auth/client';
import { authSessionSecret } from '@/server/auth/env';
import { fail, json } from '@/server/auth/http';
import { clientIp } from '@/server/auth/request';
import { getSessionAuthContext } from '@/server/auth/require-user';
import {
  generateSessionToken,
  hashToken,
  readCookieValue,
  signCookieValue,
} from '@/server/auth/session-token';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/session/rotate — swap the mobile app's bearer token for a fresh
 * one (docs/mobile/01-discovery.md §7.1 step 6). The app calls it every 7 days.
 *
 * Bearer-only: browsers keep their cookie. The row keeps its provenance and its
 * absolute expiry; the swap is refused if the session is no longer valid, so it
 * can never revive a session that was revoked or invalidated.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const raw = bearerToken(await headers());
  if (raw === null) {
    return fail('Rotation is only available to the mobile app.', 400, { code: 'NOT_BEARER' });
  }
  // The full validity check (idle, absolute, security version, account status).
  const context = await getSessionAuthContext();
  const oldToken = readCookieValue(raw, authSessionSecret());
  if (context === null || oldToken === null) {
    return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED', remedy: 'Sign in again.' });
  }

  const db = getDatabase();
  const fresh = generateSessionToken();
  const rotated = await rotateSessionToken(db, hashToken(oldToken), hashToken(fresh));
  if (rotated === null) {
    return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED', remedy: 'Sign in again.' });
  }

  await writeAudit(db, {
    event: 'session_rotated',
    userId: rotated.userId,
    ipAddress: clientIp(request),
    detail: { client: nativeClientLabel(request.headers) ?? 'unknown' },
  });

  return json({
    ok: true,
    session: {
      token: signCookieValue(fresh, authSessionSecret()),
      expiresAt: rotated.expiresAt.toISOString(),
    },
  });
}
