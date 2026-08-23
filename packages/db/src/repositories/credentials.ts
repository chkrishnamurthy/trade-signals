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
