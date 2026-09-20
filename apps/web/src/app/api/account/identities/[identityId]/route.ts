import { disconnectGoogleIdentity, getUserForLogin, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { verifyPassword } from '@/server/auth/password';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { identityDisconnectSchema } from '@/server/auth/schemas';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ identityId: string }> },
): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });

  const user = await getSessionUser();
  if (!user) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });

  const id = Number((await context.params).identityId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return fail('Invalid request.', 400, { code: 'INVALID_BODY' });
  }

  const parsed = identityDisconnectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('Invalid request.', 400, { code: 'INVALID_BODY' });
  }

  const db = getDatabase();
  const login = await getUserForLogin(db, user.email);

  if (login !== null) {
    const password = parsed.data.currentPassword;
    if (!password || !(await verifyPassword(login.passwordHash, password))) {
      return fail('Current password is required to disconnect this method.', 400, {
        code: 'BAD_CREDENTIALS',
      });
    }
  }

  const result = await disconnectGoogleIdentity(db, user.id, id);

  if (result === 'last_method') {
    return fail('You cannot disconnect your only login method. Add a password first.', 400, {
      code: 'LAST_METHOD',
    });
  }

  if (result === 'not_found') {
    return fail('Identity not found.', 404, { code: 'NOT_FOUND' });
  }

  await writeAudit(db, {
    userId: user.id,
    event: 'identity_unlinked',
    ipAddress: clientIp(request),
    detail: { identityId: id, provider: 'google' },
  });

  return json({ ok: true });
}
