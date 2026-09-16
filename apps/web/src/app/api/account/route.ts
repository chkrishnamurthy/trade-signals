import { deleteUser, getAvatarUrl, getUserForLogin, listUsers, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/server/auth/cookies';
import { fail, json } from '@/server/auth/http';
import { verifyPassword } from '@/server/auth/password';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';
import { deleteAvatarByUrl } from '@/server/profile/avatar';
import { deleteAccountSchema } from '@/server/profile/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/account — permanently delete the signed-in user's own account.
 *
 * Re-authenticates with the password and requires the literal confirmation
 * string. Everything the user owns (profile, credential, sessions, tokens, and —
 * via `owner_id` cascade — watchlists and views) is removed; the append-only
 * audit row survives. Refuses if the account is the last admin, so the product
 * can never be left with no operator.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });

  const user = await getSessionUser();
  if (user === null) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('Request body is not valid JSON.', 400, { code: 'INVALID_BODY' });
  }
  const parsed = deleteAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('Type DELETE and enter your password to confirm.', 400, { code: 'INVALID_BODY' });
  }

  const db = getDatabase();
  const login = await getUserForLogin(db, user.email);
  if (login === null || !(await verifyPassword(login.passwordHash, parsed.data.password))) {
    return fail('Password is incorrect.', 400, { code: 'BAD_CREDENTIALS' });
  }

  if (user.role === 'admin') {
    const admins = (await listUsers(db)).filter((u) => u.role === 'admin').length;
    if (admins <= 1) {
      return fail(
        'You are the only admin — promote another admin before deleting your account.',
        409,
        {
          code: 'LAST_ADMIN',
        },
      );
    }
  }

  const avatar = await getAvatarUrl(db, user.id);
  await writeAudit(db, {
    event: 'account_deleted',
    userId: user.id,
    ipAddress: clientIp(request),
  });
  await deleteUser(db, user.id);
  await deleteAvatarByUrl(avatar);
  await clearSessionCookie();

  return json({ ok: true });
}
