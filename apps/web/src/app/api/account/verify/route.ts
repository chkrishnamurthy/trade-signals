import { createToken } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { sendVerificationEmail } from '@/server/auth/email';
import { fail, json } from '@/server/auth/http';
import { checkLock, recordFailure } from '@/server/auth/rate-limit';
import { isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { generateSessionToken, hashToken } from '@/server/auth/session-token';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERIFY_TTL_MS = 30 * 60 * 1000; // 30 minutes — matches the email copy.

/**
 * POST /api/account/verify — resend the email-verification link to the signed-in
 * user's own address. No-ops (still 200) if already verified. A soft per-account
 * throttle (the shared lockout counter) stops repeated resends from spamming the
 * inbox.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });

  const user = await getSessionUser();
  if (user === null) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });

  if (user.emailVerifiedAt !== null) {
    return json({ ok: true, alreadyVerified: true });
  }

  const throttleKey = `verify-resend:${user.id}`;
  const lock = await checkLock(throttleKey);
  if (lock.locked) {
    return fail('Too many requests — try again later.', 429, {
      code: 'RATE_LIMITED',
      remedy: `Wait ${lock.retryAfterSec}s and try again.`,
    });
  }
  await recordFailure(throttleKey);

  const db = getDatabase();
  const token = generateSessionToken();
  await createToken(db, {
    userId: user.id,
    purpose: 'email_verify',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  await sendVerificationEmail(user.email, token);

  return json({ ok: true });
}
