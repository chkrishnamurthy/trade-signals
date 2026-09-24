import {
  deleteOtherSessionsForUser,
  deleteSessionForUser,
  getSessionContext,
  listSessionsForUser,
  writeAudit,
} from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';
import { currentSessionTokenHash } from '@/server/profile/current-session';
import { sessionActionSchema } from '@/server/profile/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/account/sessions — the signed-in user's active sessions, "this device" flagged. */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (user === null) return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });

  const db = getDatabase();
  const tokenHash = await currentSessionTokenHash();
  const currentId =
    tokenHash === null ? null : ((await getSessionContext(db, tokenHash))?.session.id ?? null);

  const sessions = (await listSessionsForUser(db, user.id)).map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    client: s.client,
    deviceName: s.deviceName,
    authenticationMethod: s.authenticationMethod,
    isCurrent: s.id === currentId,
  }));

  return json({ sessions });
}

/**
 * DELETE /api/account/sessions — revoke one session (`{ sessionId }`) or every
 * other device (`{ scope: 'others' }`), keeping the current one.
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
  const parsed = sessionActionSchema.safeParse(raw);
  if (!parsed.success) return fail('Invalid request.', 400, { code: 'INVALID_BODY' });

  const db = getDatabase();

  if ('scope' in parsed.data) {
    const tokenHash = await currentSessionTokenHash();
    if (tokenHash === null) return fail('No active session.', 401, { code: 'UNAUTHENTICATED' });
    const revoked = await deleteOtherSessionsForUser(db, user.id, tokenHash);
    await writeAudit(db, {
      event: 'sessions_revoked_others',
      userId: user.id,
      ipAddress: clientIp(request),
      detail: { count: revoked },
    });
    return json({ ok: true, revoked });
  }

  const removed = await deleteSessionForUser(db, user.id, parsed.data.sessionId);
  if (!removed) return fail('Session not found.', 404, { code: 'NOT_FOUND' });
  await writeAudit(db, { event: 'session_revoked', userId: user.id, ipAddress: clientIp(request) });
  return json({ ok: true, revoked: 1 });
}
