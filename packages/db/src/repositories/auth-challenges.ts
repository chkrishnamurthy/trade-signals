import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { authChallenges } from '../schema/auth.js';

export type ChallengePurpose = 'google_oauth' | 'mfa' | 'reauth';

export interface AuthChallenge {
  readonly id: number;
  readonly purpose: ChallengePurpose;
  readonly userId: number | null;
  readonly sessionId: number | null;
  readonly identityId: number | null;
  readonly browserBindingHash: string | null;
  readonly securityVersion: number;
  readonly data: Record<string, unknown>;
  readonly expiresAt: Date;
}

export async function createChallenge(
  db: Database,
  input: {
    purpose: ChallengePurpose;
    tokenHash: string;
    userId?: number | null;
    sessionId?: number | null;
    identityId?: number | null;
    browserBindingHash?: string | null;
    securityVersion?: number;
    maxAttempts?: number;
    data?: Record<string, unknown>;
    expiresAt: Date;
  },
): Promise<void> {
  await db.insert(authChallenges).values(input);
}

export async function consumeChallenge(
  db: Database,
  input: {
    tokenHash: string;
    purpose: ChallengePurpose;
    browserBindingHash?: string | null;
  },
): Promise<AuthChallenge | null> {
  const binding = input.browserBindingHash;
  const rows = await db
    .update(authChallenges)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(authChallenges.tokenHash, input.tokenHash),
        eq(authChallenges.purpose, input.purpose),
        isNull(authChallenges.consumedAt),
        sql`${authChallenges.expiresAt} > now()`,
        sql`${authChallenges.attempts} < ${authChallenges.maxAttempts}`,
        binding === undefined
          ? sql`true`
          : binding === null
            ? isNull(authChallenges.browserBindingHash)
            : eq(authChallenges.browserBindingHash, binding),
      ),
    )
    .returning();
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        purpose: row.purpose as ChallengePurpose,
        userId: row.userId,
        sessionId: row.sessionId,
        identityId: row.identityId,
        browserBindingHash: row.browserBindingHash,
        securityVersion: row.securityVersion,
        data: (row.data ?? {}) as Record<string, unknown>,
        expiresAt: row.expiresAt,
      };
}

export async function getActiveChallenge(
  db: Database,
  tokenHash: string,
  purpose: ChallengePurpose,
  browserBindingHash: string | null,
): Promise<AuthChallenge | null> {
  const rows = await db
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.tokenHash, tokenHash),
        eq(authChallenges.purpose, purpose),
        isNull(authChallenges.consumedAt),
        sql`${authChallenges.expiresAt} > now()`,
        sql`${authChallenges.attempts} < ${authChallenges.maxAttempts}`,
        browserBindingHash === null
          ? isNull(authChallenges.browserBindingHash)
          : eq(authChallenges.browserBindingHash, browserBindingHash),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        purpose: row.purpose as ChallengePurpose,
        userId: row.userId,
        sessionId: row.sessionId,
        identityId: row.identityId,
        browserBindingHash: row.browserBindingHash,
        securityVersion: row.securityVersion,
        data: (row.data ?? {}) as Record<string, unknown>,
        expiresAt: row.expiresAt,
      };
}

export async function recordChallengeFailure(db: Database, id: number): Promise<void> {
  await db
    .update(authChallenges)
    .set({ attempts: sql`${authChallenges.attempts} + 1` })
    .where(and(eq(authChallenges.id, id), isNull(authChallenges.consumedAt)));
}

export async function consumeChallengeById(db: Database, id: number): Promise<boolean> {
  const rows = await db
    .update(authChallenges)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(authChallenges.id, id),
        isNull(authChallenges.consumedAt),
        sql`${authChallenges.expiresAt} > now()`,
        sql`${authChallenges.attempts} < ${authChallenges.maxAttempts}`,
      ),
    )
    .returning({ id: authChallenges.id });
  return rows.length === 1;
}

export async function deleteExpiredChallenges(db: Database): Promise<number> {
  const result = await db.delete(authChallenges).where(lt(authChallenges.expiresAt, sql`now()`));
  return result.rowCount ?? 0;
}
