import {
  deleteAllSessionsForUser,
  getUserForLogin,
  updatePassword,
  writeAudit,
} from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { sendPasswordChangedNotice } from '@/server/auth/email';
import { fail, json } from '@/server/auth/http';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { validatePassword } from '@/server/auth/password-policy';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { startSession } from '@/server/auth/session';
import { getDatabase } from '@/server/db';
import { changePasswordSchema } from '@/server/profile/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/account/password — change password while signed in.
 *
 * Requires the current password (a hijacked session can't lock the owner out),
 * enforces the same strength + breach checks as signup, then bumps
 * `password_changed_at` — which invalidates every existing session. To avoid
 * logging the acting device out too, we drop all sessions and immediately mint a
 * fresh one for this request. Net effect: this device stays in, all others are
 * signed out.
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
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? 'Invalid request.', 400, { code: 'INVALID_BODY' });
  }
  const { currentPassword, newPassword } = parsed.data;

  const db = getDatabase();
  const login = await getUserForLogin(db, user.email);
  if (login === null || !(await verifyPassword(login.passwordHash, currentPassword))) {
    return fail('Current password is incorrect.', 400, { code: 'BAD_CREDENTIALS' });
  }
  if (newPassword === currentPassword) {
    return fail('Choose a password different from your current one.', 400, {
      code: 'SAME_PASSWORD',
    });
  }

  const strength = validatePassword(newPassword);
  if (!strength.ok) return fail(strength.reason, 400, { code: 'WEAK_PASSWORD' });

  await updatePassword(db, user.id, await hashPassword(newPassword));
  await deleteAllSessionsForUser(db, user.id);
  await startSession(user.id, request); // fresh cookie for this device
  await writeAudit(db, {
    event: 'password_changed',
    userId: user.id,
    ipAddress: clientIp(request),
  });
  await sendPasswordChangedNotice(user.email);

  return json({ ok: true });
}
