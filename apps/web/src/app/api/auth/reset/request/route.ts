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

/** POST /api/auth/reset/request — email a reset link. Always answers the same (no enumeration). */
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
  // Even an invalid email gets the generic answer, to reveal nothing.
  if (!parsed.success) return json({ ok: true });
  const { email } = parsed.data;

  // Throttle reset spam per IP.
  const ipKey = `reset-ip:${clientIp(request) ?? 'unknown'}`;
  const lock = await checkLock(ipKey);
  if (lock.locked) return json({ ok: true });
  await recordFailure(ipKey);

  const db = getDatabase();
  const found = await getUserForLogin(db, email);
  if (found !== null) {
    const token = generateSessionToken();
    await createToken(db, {
      userId: found.user.id,
      purpose: 'password_reset',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    await sendPasswordResetEmail(email, token);
    await writeAudit(db, { event: 'password_reset_requested', userId: found.user.id, ipAddress: clientIp(request) });
  }

  return json({ ok: true });
}
