import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  authAttempts,
  authAudit,
  authCredentials,
  authSessions,
  authTokens,
  authUsers,
  userProfiles,
} from '../schema/auth.js';

/**
 * Authentication data access. Every auth read/write funnels through here, so a
 * route handler, the worker's cleanup job, and any script all touch the tables
 * the same way. Business rules (hashing, cookies, lockout maths) live in the web
 * app; this layer is only queries.
 */

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'disabled';

export interface AuthUser {
  readonly id: number;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly createdAt: Date;
}

export interface UserProfile {
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
  readonly timezone: string;
  readonly locale: string;
  readonly preferences: Record<string, unknown>;
}

export interface UserWithProfile extends AuthUser {
  readonly profile: UserProfile;
}

export interface AuthSession {
  readonly id: number;
  readonly userId: number;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
  readonly expiresAt: Date;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface NewUser {
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly termsAcceptedAt: Date;
}

// ── Users ──────────────────────────────────────────────────────────────────

/**
 * Create an account, its profile, and its credential in one transaction.
 * Throws a unique-violation (23505) if the email is already registered — the
 * caller turns that into an enumeration-safe response.
 */
export async function createUser(db: Database, input: NewUser): Promise<AuthUser> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(authUsers)
      .values({ email: input.email, termsAcceptedAt: input.termsAcceptedAt })
      .returning();
    const user = inserted[0];
    if (user === undefined) throw new Error('user insert returned no row');

    await tx.insert(userProfiles).values({ userId: user.id, displayName: input.displayName });
    await tx.insert(authCredentials).values({ userId: user.id, passwordHash: input.passwordHash });

    return toAuthUser(user);
  });
}

/** Login lookup: the user, their password hash, and whether 2FA is enabled. */
export async function getUserForLogin(
  db: Database,
  email: string,
): Promise<{ user: AuthUser; passwordHash: string } | null> {
  const rows = await db
    .select({ user: authUsers, passwordHash: authCredentials.passwordHash })
    .from(authUsers)
    .innerJoin(authCredentials, eq(authCredentials.userId, authUsers.id))
    .where(eq(authUsers.email, email))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  return { user: toAuthUser(row.user), passwordHash: row.passwordHash };
}

/** The user plus profile, for the session/whoami response. */
export async function getUserWithProfile(
  db: Database,
  userId: number,
): Promise<UserWithProfile | null> {
  const rows = await db
    .select({ user: authUsers, profile: userProfiles })
    .from(authUsers)
    .innerJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
    .where(eq(authUsers.id, userId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  return {
    ...toAuthUser(row.user),
    profile: {
      displayName: row.profile.displayName,
      avatarUrl: row.profile.avatarUrl,
      bio: row.profile.bio,
      timezone: row.profile.timezone,
      locale: row.profile.locale,
      preferences: (row.profile.preferences ?? {}) as Record<string, unknown>,
    },
  };
}

export async function markEmailVerified(db: Database, userId: number): Promise<void> {
  await db
    .update(authUsers)
    .set({ emailVerifiedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(authUsers.id, userId), isNull(authUsers.emailVerifiedAt)));
}

/** Set a new password and stamp the change (which invalidates older sessions). */
export async function updatePassword(
  db: Database,
  userId: number,
  passwordHash: string,
): Promise<void> {
  await db
    .update(authCredentials)
    .set({ passwordHash, passwordChangedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(authCredentials.userId, userId));
}

/** Admin-only: promote/demote a role. */
export async function setUserRole(db: Database, userId: number, role: UserRole): Promise<void> {
  await db
    .update(authUsers)
    .set({ role, updatedAt: sql`now()` })
    .where(eq(authUsers.id, userId));
}

/**
 * Delete an account. The profile, credential, sessions, tokens, and 2FA rows
 * cascade away; the user's owned data (once `owner_id` exists) cascades too. Audit
 * rows survive by design — their `user_id` is not a foreign key.
 */
export async function deleteUser(db: Database, userId: number): Promise<void> {
  await db.delete(authUsers).where(eq(authUsers.id, userId));
}

/** Admin-only: activate or disable an account. */
export async function setUserStatus(
  db: Database,
  userId: number,
  status: UserStatus,
): Promise<void> {
  await db
    .update(authUsers)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(authUsers.id, userId));
}

export interface AdminUserRow extends AuthUser {
  readonly displayName: string;
}

/** Admin operator view: recent accounts with their display name. */
export async function listUsers(db: Database, limit = 200): Promise<AdminUserRow[]> {
  const rows = await db
    .select({ user: authUsers, displayName: userProfiles.displayName })
    .from(authUsers)
    .innerJoin(userProfiles, eq(userProfiles.userId, authUsers.id))
    .orderBy(sql`${authUsers.createdAt} desc`)
    .limit(limit);
  return rows.map((r) => ({ ...toAuthUser(r.user), displayName: r.displayName }));
}

// ── Sessions ───────────────────────────────────────────────────────────────

export interface NewSession {
  readonly userId: number;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export async function createSession(db: Database, input: NewSession): Promise<void> {
  await db.insert(authSessions).values(input);
}

/**
 * Resolve a session by the SHA-256 of its cookie token, returning the session,
 * the user, and the credential's `passwordChangedAt` (so the caller can reject a
 * session issued before the last password change). Null if no such session.
 */
export async function getSessionContext(
  db: Database,
  tokenHash: string,
): Promise<{ session: AuthSession; user: AuthUser; passwordChangedAt: Date } | null> {
  const rows = await db
    .select({
      session: authSessions,
      user: authUsers,
      passwordChangedAt: authCredentials.passwordChangedAt,
    })
    .from(authSessions)
    .innerJoin(authUsers, eq(authUsers.id, authSessions.userId))
    .innerJoin(authCredentials, eq(authCredentials.userId, authUsers.id))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  return {
    session: toSession(row.session),
    user: toAuthUser(row.user),
    passwordChangedAt: row.passwordChangedAt,
  };
}

/** Roll the idle timeout forward. */
export async function touchSession(db: Database, tokenHash: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ lastUsedAt: sql`now()` })
    .where(eq(authSessions.tokenHash, tokenHash));
}

export async function deleteSession(db: Database, tokenHash: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
}

export async function deleteAllSessionsForUser(db: Database, userId: number): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

export async function listSessionsForUser(db: Database, userId: number): Promise<AuthSession[]> {
  const rows = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.userId, userId))
    .orderBy(sql`${authSessions.lastUsedAt} desc`);
  return rows.map(toSession);
}

/** Cleanup: drop sessions past their absolute expiry. Returns the count removed. */
export async function deleteExpiredSessions(db: Database): Promise<number> {
  const result = await db.delete(authSessions).where(lt(authSessions.expiresAt, sql`now()`));
  return result.rowCount ?? 0;
}

// ── Verification / reset tokens ──────────────────────────────────────────────

export type TokenPurpose = 'email_verify' | 'password_reset';

export async function createToken(
  db: Database,
  input: { userId: number; purpose: TokenPurpose; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(authTokens).values(input);
}

/**
 * Consume a one-shot token: returns its user id if it matches, is unexpired, and
 * was not already used — and marks it used in the same statement. Null otherwise.
 */
export async function consumeToken(
  db: Database,
  tokenHash: string,
  purpose: TokenPurpose,
): Promise<number | null> {
  const rows = await db
    .update(authTokens)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        sql`${authTokens.expiresAt} > now()`,
      ),
    )
    .returning({ userId: authTokens.userId });
  return rows[0]?.userId ?? null;
}

export async function deleteExpiredTokens(db: Database): Promise<number> {
  const result = await db.delete(authTokens).where(lt(authTokens.expiresAt, sql`now()`));
  return result.rowCount ?? 0;
}

// ── Rate-limit attempts ──────────────────────────────────────────────────────

export interface AttemptRow {
  readonly failures: number;
  readonly windowStart: Date;
  readonly lockedUntil: Date | null;
}

export async function getAttempt(db: Database, key: string): Promise<AttemptRow | null> {
  const rows = await db
    .select({
      failures: authAttempts.failures,
      windowStart: authAttempts.windowStart,
      lockedUntil: authAttempts.lockedUntil,
    })
    .from(authAttempts)
    .where(eq(authAttempts.key, key))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveAttempt(db: Database, key: string, state: AttemptRow): Promise<void> {
  await db
    .insert(authAttempts)
    .values({
      key,
      failures: state.failures,
      windowStart: state.windowStart,
      lockedUntil: state.lockedUntil,
    })
    .onConflictDoUpdate({
      target: authAttempts.key,
      set: {
        failures: sql`excluded.failures`,
        windowStart: sql`excluded.window_start`,
        lockedUntil: sql`excluded.locked_until`,
        updatedAt: sql`now()`,
      },
    });
}

export async function clearAttempt(db: Database, key: string): Promise<void> {
  await db.delete(authAttempts).where(eq(authAttempts.key, key));
}

export async function deleteStaleAttempts(db: Database, before: Date): Promise<number> {
  const result = await db
    .delete(authAttempts)
    .where(and(lt(authAttempts.windowStart, before), isNull(authAttempts.lockedUntil)));
  return result.rowCount ?? 0;
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  readonly event: string;
  readonly userId?: number | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly detail?: Record<string, unknown> | null;
}

/** Append a security event. `detail` must never carry a password, token, or seed. */
export async function writeAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(authAudit).values({
    event: entry.event,
    userId: entry.userId ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    detail: entry.detail ?? null,
  });
}

// ── mappers ──────────────────────────────────────────────────────────────────

function toAuthUser(row: typeof authUsers.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    createdAt: row.createdAt,
  };
}

function toSession(row: typeof authSessions.$inferSelect): AuthSession {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  };
}
