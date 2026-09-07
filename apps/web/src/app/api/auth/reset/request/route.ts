import { createToken, getUserForLogin, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { sendPasswordResetEmail } from '@/server/auth/email';
import { fail, json } from '@/server/auth/http';
import { checkLock, recordFailure } from '@/server/auth/rate-limit';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { resetRequestSchema } from '@/server/auth/schemas';
import { generateSessionToken, hashToken } from '@/server/auth/session-token';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESET_TTL_MS = 30 * 60_000;

/**
 * POST /api/auth/reset/request — email a reset link.
 *
 * UX choice (product decision): when no account exists for the email we tell the
 * requester so, and point them at sign-up, rather than returning the same generic
 * message for every address. This is deliberately NOT enumeration-safe — it lets
 * someone probe which emails are registered. The IP throttle below is what blunts
 * mass-probing; keep it. To restore enumeration-safety, return `json({ ok: true })`
 * in place of the NO_ACCOUNT branch.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('Request body is not valid JSON.', 400, { code: 'INVALID_BODY' });
  }
  const parsed = resetRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('Enter a valid email address.', 400, { code: 'INVALID_BODY' });
  }
  const { email } = parsed.data;

  // Throttle reset spam per IP — still enforced, and now the limiter is the main
  // defence against using this endpoint to enumerate registered emails at scale.
  const ipKey = `reset-ip:${clientIp(request) ?? 'unknown'}`;
  const lock = await checkLock(ipKey);
  if (lock.locked) {
    return fail('Too many reset attempts. Please wait a few minutes and try again.', 429, {
      code: 'RATE_LIMITED',
    });
  }
  await recordFailure(ipKey);

  const db = getDatabase();
  const found = await getUserForLogin(db, email);
  if (found === null) {
    return fail("We couldn't find an account with that email. Please sign up first.", 404, {
      code: 'NO_ACCOUNT',
      remedy: 'Create an account, then sign in.',
    });
  }

  const token = generateSessionToken();
  await createToken(db, {
    userId: found.user.id,
    purpose: 'password_reset',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });
  await sendPasswordResetEmail(email, token);
  await writeAudit(db, {
    event: 'password_reset_requested',
    userId: found.user.id,
    ipAddress: clientIp(request),
  });

  return json({ ok: true });
}
