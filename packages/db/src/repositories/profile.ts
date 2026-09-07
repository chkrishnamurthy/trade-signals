import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { authSessions, authUsers, userProfiles } from '../schema/auth.js';

/**
 * Profile & account self-service data access — the writes behind the user's own
 * profile page. Kept in its own repository (rather than added to `auth.ts`) so
 * the profile feature is a self-contained slice: business rules (validation,
 * hashing, email tokens) live in the web app; this layer is only queries.
 *
 * Two boundaries are deliberate:
 *   - `updateProfile` writes ONLY `user_profiles` — never identity/security
 *     columns. That is the repo rule the profile-edit page rests on.
 *   - `updateUserEmail` DOES touch `auth_users`, so it lives here as a separate,
 *     explicit function a route calls only after the new address is verified —
 *     never as part of a profile patch.
 */

/** The subset of `user_profiles` a user may edit. All fields optional (a patch). */
export interface ProfilePatch {
  readonly displayName?: string;
  readonly bio?: string | null;
  readonly timezone?: string;
  readonly locale?: string;
  readonly avatarUrl?: string | null;
  readonly preferences?: Record<string, unknown>;
}

/**
 * Apply a partial update to a user's profile row. Only the provided keys are
 * written; `updatedAt` is always bumped. A no-op patch still refreshes the
 * timestamp, which is harmless.
 */
export async function updateProfile(
  db: Database,
  userId: number,
  patch: ProfilePatch,
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: sql`now()` };
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.bio !== undefined) set.bio = patch.bio;
  if (patch.timezone !== undefined) set.timezone = patch.timezone;
  if (patch.locale !== undefined) set.locale = patch.locale;
  if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl;
  if (patch.preferences !== undefined) set.preferences = patch.preferences;

  await db.update(userProfiles).set(set).where(eq(userProfiles.userId, userId));
}

/** The current avatar path for a user (so a replace/remove can delete the old file). */
export async function getAvatarUrl(db: Database, userId: number): Promise<string | null> {
  const rows = await db
    .select({ avatarUrl: userProfiles.avatarUrl })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return rows[0]?.avatarUrl ?? null;
}

/**
 * Swap a user's email and mark it verified (the caller only reaches this after
 * the new address proved reachable via a signed confirmation link). Throws a
 * unique-violation (23505) if the address was taken in the meantime — the route
 * turns that into a friendly "already in use" message.
 */
export async function updateUserEmail(db: Database, userId: number, email: string): Promise<void> {
  await db
    .update(authUsers)
    .set({ email, emailVerifiedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(authUsers.id, userId));
}

/** True when some account already owns this (lower-cased) email. */
export async function emailInUse(db: Database, email: string): Promise<boolean> {
  const rows = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);
  return rows[0] !== undefined;
}

/**
 * Revoke a single session by id, scoped to its owner so one user can never end
 * another's session. Returns true when a row was actually deleted.
 */
export async function deleteSessionForUser(
  db: Database,
  userId: number,
  sessionId: number,
): Promise<boolean> {
  const rows = await db
    .delete(authSessions)
    .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)))
    .returning({ id: authSessions.id });
  return rows[0] !== undefined;
}

/**
 * End every session for a user EXCEPT the one whose token hash is given (the
 * current device). Powers "log out of all other devices" without logging the
 * user out where they are standing. Returns the number revoked.
 */
export async function deleteOtherSessionsForUser(
  db: Database,
  userId: number,
  keepTokenHash: string,
): Promise<number> {
  const result = await db
    .delete(authSessions)
    .where(
      and(eq(authSessions.userId, userId), sql`${authSessions.tokenHash} <> ${keepTokenHash}`),
    );
  return result.rowCount ?? 0;
}
