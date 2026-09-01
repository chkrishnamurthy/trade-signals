import { eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { providerCredentials } from '../schema/credentials.js';

/**
 * The shared market-data credential.
 *
 * The worker mints and writes; every other process reads. See the table's own
 * comment in `schema/credentials.ts` for why this lives in Postgres rather than
 * on disk.
 */

export interface StoredCredential {
  readonly providerId: string;
  readonly appId: string;
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly updatedAt: Date;
}

export interface CredentialInput {
  readonly providerId: string;
  readonly appId: string;
  readonly accessToken: string;
  readonly expiresAt: Date;
}

/** The current credential for a provider, or null when none was ever written. */
export async function getProviderCredential(
  db: Database,
  providerId: string,
): Promise<StoredCredential | null> {
  const rows = await db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.providerId, providerId))
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  return {
    providerId: row.providerId,
    appId: row.appId,
    accessToken: row.accessToken,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Replaces the credential for a provider.
 *
 * An overwrite, not an append: see the table comment for why keeping the
 * previous token would be a liability rather than a record.
 */
export async function saveProviderCredential(
  db: Database,
  credential: CredentialInput,
): Promise<void> {
  await db
    .insert(providerCredentials)
    .values({
      providerId: credential.providerId,
      appId: credential.appId,
      accessToken: credential.accessToken,
      expiresAt: credential.expiresAt,
    })
    .onConflictDoUpdate({
      target: providerCredentials.providerId,
      set: {
        appId: sql`excluded.app_id`,
        accessToken: sql`excluded.access_token`,
        expiresAt: sql`excluded.expires_at`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Marks the stored credential expired (without deleting it) so the next refresh
 * mints a fresh one.
 *
 * The refresh path trusts the recorded `expiresAt` and reuses a token whose
 * expiry is still in the future. But a token can be invalidated UPSTREAM before
 * that — Fyers is single-session, so a separate login (e.g. the operator logging
 * in to place a trade) kills it early. The worker then holds a token Fyers
 * rejects, yet never re-mints because its clock says the token is still good.
 * Calling this after such a rejection lets the next cycle recover on its own.
 */
export async function invalidateProviderCredential(
  db: Database,
  providerId: string,
): Promise<void> {
  await db
    .update(providerCredentials)
    .set({ expiresAt: new Date(0), updatedAt: sql`now()` })
    .where(eq(providerCredentials.providerId, providerId));
}
