import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { authMfa, authUsers } from '../schema/auth.js';

export interface MfaRecord {
  readonly secretEncrypted: string;
  readonly enabledAt: Date | null;
  readonly recoveryCodeHashes: readonly string[];
  readonly lastUsedStep: number | null;
}

export async function getMfaRecord(db: Database, userId: number): Promise<MfaRecord | null> {
  const rows = await db.select().from(authMfa).where(eq(authMfa.userId, userId)).limit(1);
  const row = rows[0];
  return row === undefined
    ? null
    : {
        secretEncrypted: row.totpSecretEnc,
        enabledAt: row.enabledAt,
        recoveryCodeHashes: row.recoveryCodes,
        lastUsedStep: row.lastUsedStep,
      };
}

export async function mfaEnabled(db: Database, userId: number): Promise<boolean> {
  const rows = await db
    .select({ userId: authMfa.userId })
    .from(authMfa)
    .where(and(eq(authMfa.userId, userId), isNotNull(authMfa.enabledAt)))
    .limit(1);
  return rows.length === 1;
}

export async function savePendingMfaEnrollment(
  db: Database,
  userId: number,
  secretEncrypted: string,
  recoveryCodeHashes: readonly string[],
): Promise<void> {
  await db
    .insert(authMfa)
    .values({ userId, totpSecretEnc: secretEncrypted, recoveryCodes: [...recoveryCodeHashes] })
    .onConflictDoUpdate({
      target: authMfa.userId,
      set: {
        totpSecretEnc: secretEncrypted,
        recoveryCodes: [...recoveryCodeHashes],
        enabledAt: null,
        lastUsedStep: null,
        updatedAt: sql`now()`,
      },
      setWhere: isNull(authMfa.enabledAt),
    });
}

export async function enableMfa(
  db: Database,
  userId: number,
  acceptedStep: number,
): Promise<boolean> {
  const rows = await db
    .update(authMfa)
    .set({ enabledAt: sql`now()`, lastUsedStep: acceptedStep, updatedAt: sql`now()` })
    .where(and(eq(authMfa.userId, userId), isNull(authMfa.enabledAt)))
    .returning({ userId: authMfa.userId });
  return rows.length === 1;
}

export async function acceptTotpStep(db: Database, userId: number, step: number): Promise<boolean> {
  const rows = await db
    .update(authMfa)
    .set({ lastUsedStep: step, updatedAt: sql`now()` })
    .where(
      and(
        eq(authMfa.userId, userId),
        isNotNull(authMfa.enabledAt),
        sql`(${authMfa.lastUsedStep} is null or ${authMfa.lastUsedStep} < ${step})`,
      ),
    )
    .returning({ userId: authMfa.userId });
  return rows.length === 1;
}

export async function consumeRecoveryCode(
  db: Database,
  userId: number,
  codeHash: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      select recovery_codes from auth_mfa
      where user_id = ${userId} and enabled_at is not null
      for update
    `);
    const row = result.rows[0] as { recovery_codes?: unknown } | undefined;
    const codes = Array.isArray(row?.recovery_codes)
      ? row.recovery_codes.filter((value): value is string => typeof value === 'string')
      : [];
    if (!codes.includes(codeHash)) return false;
    await tx
      .update(authMfa)
      .set({ recoveryCodes: codes.filter((value) => value !== codeHash), updatedAt: sql`now()` })
      .where(eq(authMfa.userId, userId));
    return true;
  });
}

export async function disableMfa(db: Database, userId: number): Promise<number | null> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(authMfa)
      .where(eq(authMfa.userId, userId))
      .returning({ userId: authMfa.userId });
    if (removed.length === 0) return null;
    const users = await tx
      .update(authUsers)
      .set({ securityVersion: sql`${authUsers.securityVersion} + 1`, updatedAt: sql`now()` })
      .where(eq(authUsers.id, userId))
      .returning({ securityVersion: authUsers.securityVersion });
    return users[0]?.securityVersion ?? null;
  });
}
