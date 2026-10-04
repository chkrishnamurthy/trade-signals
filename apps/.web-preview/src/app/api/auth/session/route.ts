import { getUserWithProfile } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { json } from '@/server/auth/http';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth/session — the current user (identity + profile), or null. No secrets. */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (user === null) return json({ user: null });

  const full = await getUserWithProfile(getDatabase(), user.id);
  if (full === null) return json({ user: null });

  return json({
    user: {
      id: full.id,
      email: full.email,
      role: full.role,
      emailVerified: full.emailVerifiedAt !== null,
      profile: full.profile,
    },
  });
}
