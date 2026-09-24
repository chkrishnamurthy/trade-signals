import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  authCredentials,
  authIdentities,
  authSessions,
  authUsers,
  userProfiles,
} from '../schema/auth.js';
import type { AuthUser } from './auth.js';

export interface GooglePrincipal {
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayName: string | null;
  readonly avatarUrl?: string | null;
}

export interface ResolvedGoogleIdentity {
  readonly identityId: number;
  readonly user: AuthUser;
}

export interface AccountMethodSummary {
  readonly id: number;
  readonly provider: 'google';
  readonly email: string | null;
  readonly connectedAt: Date;
  readonly lastUsedAt: Date | null;
}

export async function resolveGoogleIdentity(
  db: Database,
  principal: GooglePrincipal,
): Promise<ResolvedGoogleIdentity | null> {
  const rows = await db
    .select({ identity: authIdentities, user: authUsers })
    .from(authIdentities)
    .innerJoin(authUsers, eq(authUsers.id, authIdentities.userId))
    .where(
      and(
        eq(authIdentities.providerType, 'google'),
        eq(authIdentities.providerSubject, principal.subject),
        isNull(authIdentities.disabledAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  await db
    .update(authIdentities)
    .set({
      providerEmail: principal.email,
      providerEmailVerified: principal.emailVerified,
      lastUsedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(authIdentities.id, row.identity.id));

  return { identityId: row.identity.id, user: mapUser(row.user) };
}

export async function findUserByEmail(
  db: Database,
  email: string,
): Promise<{ user: AuthUser; hasPassword: boolean } | null> {
  const rows = await db
    .select({ user: authUsers, credentialUserId: authCredentials.userId })
    .from(authUsers)
    .leftJoin(authCredentials, eq(authCredentials.userId, authUsers.id))
    .where(eq(authUsers.email, email))
    .limit(1);

  const row = rows[0];
  return row === undefined
    ? null
    : { user: mapUser(row.user), hasPassword: row.credentialUserId !== null };
}

export async function createGoogleUser(
  db: Database,
  input: {
    principal: GooglePrincipal;
    displayName: string;
    termsAcceptedAt?: Date;
    termsVersion?: string | null;
  },
): Promise<ResolvedGoogleIdentity> {
  return db.transaction(async (tx) => {
    const users = await tx
      .insert(authUsers)
      .values({
        email: input.principal.email,
        emailVerifiedAt: input.principal.emailVerified ? sql`now()` : null,
        termsAcceptedAt: input.termsAcceptedAt ?? sql`now()`,
        termsVersion: input.termsVersion ?? null,
      })
      .returning();
    const user = users[0];
    if (user === undefined) throw new Error('google user insert returned no row');

    await tx.insert(userProfiles).values({
      userId: user.id,
      displayName: input.displayName,
      avatarUrl: input.principal.avatarUrl ?? null,
    });

    const identities = await tx
      .insert(authIdentities)
      .values({
        userId: user.id,
        providerType: 'google',
        providerSubject: input.principal.subject,
        providerEmail: input.principal.email,
        providerEmailVerified: input.principal.emailVerified,
        metadata: input.principal.avatarUrl ? { avatarUrl: input.principal.avatarUrl } : {},
        lastUsedAt: sql`now()`,
      })
      .returning({ id: authIdentities.id });

    const identity = identities[0];
    if (identity === undefined) throw new Error('google identity insert returned no row');

    return { identityId: identity.id, user: mapUser(user) };
  });
}

export async function linkGoogleIdentity(
  db: Database,
  userId: number,
  principal: GooglePrincipal,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from auth_users where id = ${userId} for update`);

    // Ensure user's emailVerifiedAt is set if Google reports verified
    if (principal.emailVerified) {
      await tx
        .update(authUsers)
        .set({ emailVerifiedAt: sql`coalesce(${authUsers.emailVerifiedAt}, now())` })
        .where(eq(authUsers.id, userId));
    }

    const identities = await tx
      .insert(authIdentities)
      .values({
        userId,
        providerType: 'google',
        providerSubject: principal.subject,
        providerEmail: principal.email,
        providerEmailVerified: principal.emailVerified,
        metadata: principal.avatarUrl ? { avatarUrl: principal.avatarUrl } : {},
        lastUsedAt: sql`now()`,
      })
      .returning({ id: authIdentities.id });

    const identity = identities[0];
    if (identity === undefined) throw new Error('google identity insert returned no row');

    return identity.id;
  });
}

export async function listAccountMethods(
  db: Database,
  userId: number,
): Promise<{ hasPassword: boolean; identities: AccountMethodSummary[] }> {
  const credentials = await db
    .select({ userId: authCredentials.userId })
    .from(authCredentials)
    .where(eq(authCredentials.userId, userId))
    .limit(1);

  const rows = await db
    .select()
    .from(authIdentities)
    .where(and(eq(authIdentities.userId, userId), isNull(authIdentities.disabledAt)));

  return {
    hasPassword: credentials.length > 0,
    identities: rows.map((identity) => ({
      id: identity.id,
      provider: 'google' as const,
      email: identity.providerEmail,
      connectedAt: identity.createdAt,
      lastUsedAt: identity.lastUsedAt,
    })),
  };
}

export async function disconnectGoogleIdentity(
  db: Database,
  userId: number,
  identityId: number,
): Promise<'deleted' | 'not_found' | 'last_method'> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from auth_users where id = ${userId} for update`);

    const owned = await tx
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(and(eq(authIdentities.id, identityId), eq(authIdentities.userId, userId)))
      .limit(1);

    if (owned.length === 0) return 'not_found';

    const password = await tx
      .select({ userId: authCredentials.userId })
      .from(authCredentials)
      .where(eq(authCredentials.userId, userId))
      .limit(1);

    const identities = await tx
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, userId), isNull(authIdentities.disabledAt)));

    if (password.length === 0 && identities.length <= 1) return 'last_method';

    await tx.delete(authSessions).where(eq(authSessions.authIdentityId, identityId));
    await tx.delete(authIdentities).where(eq(authIdentities.id, identityId));
    return 'deleted';
  });
}

function mapUser(row: typeof authUsers.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    role: row.role as AuthUser['role'],
    status: row.status as AuthUser['status'],
    securityVersion: row.securityVersion,
    createdAt: row.createdAt,
  };
}
