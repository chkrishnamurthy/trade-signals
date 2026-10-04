import { deleteAllSessionsForUser, setUserRole, setUserStatus, writeAudit } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, json } from '@/server/auth/http';
import { clientIp, isSameOrigin } from '@/server/auth/request';
import { getAdminUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

/** PATCH /api/admin/users/[id] — change a user's status or role. Admin only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });

  const admin = await getAdminUser();
  if (admin === null) return fail('Forbidden.', 403, { code: 'FORBIDDEN' });

  const targetId = Number((await params).id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return fail('Invalid user id.', 400, { code: 'INVALID_ID' });
  }
  if (targetId === admin.id) {
    // Guard against an admin locking themselves out or dropping their own rights.
    return fail('You cannot change your own account here.', 400, { code: 'SELF_CHANGE' });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('Request body is not valid JSON.', 400, { code: 'INVALID_BODY' });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return fail('Invalid request.', 400, { code: 'INVALID_BODY' });

  const db = getDatabase();
  const ip = clientIp(request);

  if (parsed.data.status !== undefined) {
    await setUserStatus(db, targetId, parsed.data.status);
    if (parsed.data.status === 'disabled') {
      // Kick a disabled user out immediately.
      await deleteAllSessionsForUser(db, targetId);
    }
    await writeAudit(db, {
      event: parsed.data.status === 'disabled' ? 'admin_disable_user' : 'admin_enable_user',
      userId: admin.id,
      ipAddress: ip,
      detail: { targetUserId: targetId },
    });
  }

  if (parsed.data.role !== undefined) {
    await setUserRole(db, targetId, parsed.data.role);
    await writeAudit(db, {
      event: 'role_changed',
      userId: admin.id,
      ipAddress: ip,
      detail: { targetUserId: targetId, role: parsed.data.role },
    });
  }

  return json({ ok: true });
}
