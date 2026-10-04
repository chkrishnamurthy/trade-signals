import { getUserWithProfile, updateProfile } from '@equitywise/db';
import type { NextResponse } from 'next/server';
import { fail, json } from '@/server/auth/http';
import { isSameOrigin } from '@/server/auth/request';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase } from '@/server/db';
import { profilePatchSchema } from '@/server/profile/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/profile — update the signed-in user's own profile.
 *
 * Writes ONLY `user_profiles` (display name, bio, timezone, preferences). It can
 * never touch identity or security columns — email, role, and status are changed
 * through their own dedicated, re-authenticated routes. `preferences` is merged
 * into the stored bag so unrelated keys survive.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Request blocked.', 403, { code: 'BAD_ORIGIN' });

  const user = await getSessionUser();
  if (user === null) {
    return fail('Not signed in.', 401, { code: 'UNAUTHENTICATED' });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('Request body is not valid JSON.', 400, { code: 'INVALID_BODY' });
  }
  const parsed = profilePatchSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? 'Invalid request.', 400, { code: 'INVALID_BODY' });
  }

  const db = getDatabase();
  const current = await getUserWithProfile(db, user.id);
  if (current === null) return fail('Account not found.', 404, { code: 'NOT_FOUND' });

  const { displayName, bio, timezone, preferences } = parsed.data;
  await updateProfile(db, user.id, {
    ...(displayName !== undefined ? { displayName } : {}),
    // An empty bio clears it.
    ...(bio !== undefined ? { bio: bio.trim() === '' ? null : bio } : {}),
    ...(timezone !== undefined ? { timezone } : {}),
    // Shallow-merge preferences so a partial patch never drops other keys.
    ...(preferences !== undefined
      ? { preferences: { ...current.profile.preferences, ...preferences } }
      : {}),
  });

  const updated = await getUserWithProfile(db, user.id);
  return json({ profile: updated?.profile ?? current.profile });
}
