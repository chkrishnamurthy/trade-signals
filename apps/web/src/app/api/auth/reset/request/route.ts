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
 * The response is deliberately identical whether or not an account exists. This
 * prevents the public endpoint from becoming an account directory; the IP
 * throttle also limits reset-email abuse.
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

  // Throttle reset spam per IP even though unknown addresses receive the same
  // response and do not result in email delivery.
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
    return json({ ok: true });
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
