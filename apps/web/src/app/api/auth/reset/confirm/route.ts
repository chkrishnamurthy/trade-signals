import { consumeToken, deleteAllSessionsForUser, updatePassword, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { hashPassword } from '@/server/auth/password';
import { validatePassword } from '@/server/auth/password-policy';
import { isPwned } from '@/server/auth/pwned';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { resetConfirmSchema } from '@/server/auth/schemas';
import { hashToken } from '@/server/auth/session-token';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/reset/confirm — set a new password from a reset token. */
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
  const parsed = resetConfirmSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? 'Invalid request.', 400, { code: 'INVALID_BODY' });
  }
  const { token, password } = parsed.data;

  const strength = validatePassword(password);
  if (!strength.ok) return fail(strength.reason, 400, { code: 'WEAK_PASSWORD' });
  if (await isPwned(password)) {
    return fail('That password has appeared in a data breach — please choose another.', 400, {
      code: 'BREACHED_PASSWORD',
    });
  }

  const db = getDatabase();
  const userId = await consumeToken(db, hashToken(token), 'password_reset');
  if (userId === null) {
    return fail('This reset link is invalid or has expired.', 400, { code: 'INVALID_TOKEN' });
  }

  await updatePassword(db, userId, await hashPassword(password));
  // Kill every existing session — a reset means "lock everyone else out".
  await deleteAllSessionsForUser(db, userId);
  await writeAudit(db, { event: 'password_reset', userId, ipAddress: clientIp(request) });

  return json({ ok: true });
}
