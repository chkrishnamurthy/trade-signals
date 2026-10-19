import { listUsers } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { requireAdminUser } from '@/server/auth/guards';
import { json } from '@/server/auth/http';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/users — the operator's account list. Admin only. */
export async function GET(): Promise<NextResponse> {
  const access = await requireAdminUser();
  if (access.denied !== null) return access.denied;

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
