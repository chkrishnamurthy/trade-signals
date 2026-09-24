import { getUserForLogin, mfaEnabled, writeAudit } from '@equitywise/db';
import { NextResponse } from 'next/server';
import { beginMfaChallenge } from '@/server/auth/challenges';
import { nativeClientLabel } from '@/server/auth/client';
import { fail, json } from '@/server/auth/http';
import { verifyPasswordOrDecoy } from '@/server/auth/password';
import { checkLock, recordFailure, recordSuccess } from '@/server/auth/rate-limit';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { signInSchema } from '@/server/auth/schemas';
import { sessionBody, startSession } from '@/server/auth/session';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/sign-in — verify credentials and start a session. */
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
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('Enter a valid email and password.', 400, { code: 'INVALID_BODY' });
  }
  const { email, password, device } = parsed.data;
  const client = nativeClientLabel(request.headers) ?? 'web';

  const ip = clientIp(request);
  const ipKey = `ip:${ip ?? 'unknown'}`;
  const emailKey = `email:${email}`;

  // Locked out on either key?
  for (const key of [ipKey, emailKey]) {
    const lock = await checkLock(key);
    if (lock.locked) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.', code: 'RATE_LIMIT' },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': String(lock.retryAfterSec) },
        },
      );
    }
  }

  const db = getDatabase();
  const found = await getUserForLogin(db, email);
  // Always spend verify time — decoy hash when the user doesn't exist.
  const passwordOk = await verifyPasswordOrDecoy(found?.passwordHash, password);

  if (found === null || !passwordOk) {
    await recordFailure(ipKey);
    await recordFailure(emailKey);
    await writeAudit(db, {
      event: 'login_failure',
      userId: found?.user.id ?? null,
      ipAddress: ip,
      detail: { client },
    });
    return fail('Invalid email or password.', 401, { code: 'INVALID_CREDENTIALS' });
  }

  if (found.user.status === 'disabled') {
    return fail('This account is disabled.', 403, { code: 'ACCOUNT_DISABLED' });
  }

  await recordSuccess(ipKey);
  await recordSuccess(emailKey);
  if (await mfaEnabled(db, found.user.id)) {
    const { challengeId, binding } = await beginMfaChallenge({
      userId: found.user.id,
      securityVersion: found.user.securityVersion,
      authenticationMethod: 'password',
    });
    return json({
      ok: true,
      status: 'mfa_required',
      challengeId,
      ...(binding === null ? {} : { binding }),
    });
  }
  const issued = await startSession(found.user.id, request, {
    securityVersion: found.user.securityVersion,
    deviceName: device?.name ?? null,
  });
  await writeAudit(db, {
    event: 'login_success',
    userId: found.user.id,
    ipAddress: ip,
    detail: { client },
  });

  return json({ ok: true, ...sessionBody(issued) });
}
