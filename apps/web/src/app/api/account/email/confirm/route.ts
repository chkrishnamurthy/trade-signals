import { emailInUse, updateUserEmail, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { sendEmailChangedNotice } from '@/server/auth/email';
import { fail, json } from '@/server/auth/http';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';
import { verifyEmailChangeToken } from '@/server/profile/email-change-token';
import { confirmEmailSchema } from '@/server/profile/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/email/confirm — finish an email change.
 *
 * The signed token proves the new inbox was reachable; requiring an authenticated
 * session for the SAME user id proves it is the account owner acting. Only then is
 * the address swapped and marked verified. The old address gets a security notice.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });

  const user = await getSessionUser();
  if (user === null) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('Request body is not valid JSON.', 400, { code: 'INVALID_BODY' });
  }
  const parsed = confirmEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('Invalid request.', 400, { code: 'INVALID_BODY' });
  }

  const claim = verifyEmailChangeToken(parsed.data.token);
  if (claim === null) {
    return fail('This link is invalid or has expired.', 400, { code: 'INVALID_TOKEN' });
  }
  if (claim.userId !== user.id) {
    return fail('This link belongs to a different account.', 403, { code: 'WRONG_ACCOUNT' });
  }
  if (claim.newEmail === user.email) {
    // Already applied (e.g. link opened twice) — treat as success, idempotently.
    return json({ ok: true, email: user.email });
  }

  const db = getDatabase();
  if (await emailInUse(db, claim.newEmail)) {
    return fail('That email is already in use.', 409, { code: 'EMAIL_IN_USE' });
  }

  const oldEmail = user.email;
  try {
    await updateUserEmail(db, user.id, claim.newEmail);
  } catch (error) {
    // Unique-violation race: taken between the check and the write.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail('That email is already in use.', 409, { code: 'EMAIL_IN_USE' });
    }
    throw error;
  }

  await writeAudit(db, {
    event: 'email_changed',
    userId: user.id,
    ipAddress: clientIp(request),
  });
  await sendEmailChangedNotice(oldEmail, claim.newEmail);

  return json({ ok: true, email: claim.newEmail });
}
