import { emailInUse, getUserForLogin, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { sendEmailChangeVerification } from '@/server/auth/email';
import { fail, json } from '@/server/auth/http';
import { verifyPassword } from '@/server/auth/password';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';
import { createEmailChangeToken } from '@/server/profile/email-change-token';
import { changeEmailSchema } from '@/server/profile/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/email — start an email change (verify-then-swap).
 *
 * We never swap the address here — that only happens once the new inbox opens the
 * signed confirmation link (`/account/verify-email`). This step re-authenticates
 * with the current password and emails the link to the NEW address.
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
  const parsed = changeEmailSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? 'Invalid request.', 400, { code: 'INVALID_BODY' });
  }
  const { newEmail, currentPassword } = parsed.data;

  const db = getDatabase();
  const login = await getUserForLogin(db, user.email);
  if (login === null || !(await verifyPassword(login.passwordHash, currentPassword))) {
    return fail('Password is incorrect.', 400, { code: 'BAD_CREDENTIALS' });
  }
  if (newEmail === user.email) {
    return fail('That is already your email address.', 400, { code: 'SAME_EMAIL' });
  }
  if (await emailInUse(db, newEmail)) {
    return fail('That email is already in use.', 409, { code: 'EMAIL_IN_USE' });
  }

  const token = createEmailChangeToken(user.id, newEmail);
  await sendEmailChangeVerification(newEmail, token);
  await writeAudit(db, {
    event: 'email_change_requested',
    userId: user.id,
    ipAddress: clientIp(request),
  });

  return json({ ok: true });
}
