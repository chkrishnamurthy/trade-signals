import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The market-data credential, shared between the processes that need it.
 *
 * Provider access tokens expire daily. The worker holds the secrets that can
 * mint a new one and writes the result here; `apps/web` only ever reads it.
 * That split is the point: a serverless deploy gets a token that dies within
 * the day and can only read market data, while the credentials capable of
 * minting one — the login ID, the TOTP seed, the PIN — never leave the host
 * running the worker.
 *
 * Why the database rather than a file: a token cached to disk cannot be shared
 * with a serverless runtime, whose filesystem is both read-only and ephemeral.
 *
 * This table is deliberately MUTABLE, which rule 5 does not contradict — that
 * rule protects price history, where an UPDATE destroys the record of what the
 * market actually did. A credential has no history worth keeping: yesterday's
 * token is expired, unusable, and a liability if retained. One row per
 * provider, overwritten in place.
 *
 * `provider_id` is our own opaque identifier (`fyers`), not a provider type.
 */
export const providerCredentials = pgTable('provider_credentials', {
  /** Our provider identifier. One row per provider, so it is the key. */
  providerId: text().primaryKey(),
  /**
   * The app the token was minted for.
   *
   * Stored so a token issued against a different app registration is rejected
   * rather than sent upstream to fail as a confusing authorisation error.
   */
  appId: text().notNull(),
  /** Bearer credential. Never logged, never sent to the browser. */
  accessToken: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
