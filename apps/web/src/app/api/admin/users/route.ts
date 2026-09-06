import { listUsers } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { getAdminUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/users — the operator's account list. Admin only. */
export async function GET(): Promise<NextResponse> {
  const admin = await getAdminUser();
  if (admin === null) return fail('Forbidden.', 403, { code: 'FORBIDDEN' });

  const users = await listUsers(getDatabase());
  return json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      emailVerified: u.emailVerifiedAt !== null,
      createdAt: u.createdAt,
    })),
  });
}
