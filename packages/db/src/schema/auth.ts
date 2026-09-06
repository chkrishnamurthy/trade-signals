import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Authentication & user model.
 *
 * The product is multi-user: every person signs up, logs in, and owns their own
 * data. All of it lives in our own Postgres (see docs/planning/authentication-plan.md).
 *
 * Two deliberate splits:
 *   - `auth_users` holds identity + security (email, role, status). It changes
 *     rarely and is never written by the profile UI.
 *   - `user_profiles` holds display data (name, avatar, bio, prefs) — the future
 *     profile-edit page writes only here, so it can grow without touching auth.
 *
 * Secrets are always stored hashed or encrypted, never in the clear:
 *   - passwords  → Argon2id hash (`auth_credentials.password_hash`)
 *   - sessions   → SHA-256 of the opaque cookie token (`auth_sessions.token_hash`)
 *   - TOTP seed  → AES-256-GCM ciphertext, base64 (`auth_mfa.totp_secret_enc`)
 *   - verify/reset tokens & recovery codes → hashes only
 *
 * Unlike candles/signals, these are ordinary mutable rows — the append-only and
 * integer-paise invariants do not apply. The one exception is `auth_audit`, made
 * insert-only by a trigger in the migration.
 */

/** Identity & security. One row per account. */
export const authUsers = pgTable(
  'auth_users',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** Login identifier. Stored lower-cased; uniqueness enforced by the index. */
    email: text().notNull(),
    /** Null = not verified. Verification is optional and never blocks login. */
    emailVerifiedAt: timestamp({ withTimezone: true }),
    /** `user` (default) or `admin`. Never set from client input. */
    role: text().notNull().default('user'),
    /** `active` or `disabled`. An admin disables abusive accounts. */
    status: text().notNull().default('active'),
    /** When the user accepted the Terms & Privacy Policy at signup. */
    termsAcceptedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_users_email_idx').on(table.email),
    check('auth_users_role_check', sql`${table.role} in ('user', 'admin')`),
    check('auth_users_status_check', sql`${table.status} in ('active', 'disabled')`),
  ],
);

/**
 * The editable profile. 1:1 with `auth_users`, cascade-deleted with it.
 *
 * `avatar_url` is a path to a file on the VPS disk (`/uploads/avatars/…`), never
 * image bytes. Null renders a generated initials avatar.
 */
export const userProfiles = pgTable('user_profiles', {
  userId: integer()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  /** Always set by the app (defaults to the email local-part when not given). */
  displayName: text().notNull(),
  avatarUrl: text(),
  bio: text(),
  timezone: text().notNull().default('Asia/Kolkata'),
  locale: text().notNull().default('en-IN'),
  /** Free-form settings (theme, default watchlist, …), validated by Zod at the API. */
  preferences: jsonb().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * The password, split from `auth_users` so a hash never rides along on a user
 * read. 1:1, cascade-deleted.
 */
export const authCredentials = pgTable('auth_credentials', {
  userId: integer()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  /** Argon2id encoded hash (embeds salt + params). Never plaintext. */
  passwordHash: text().notNull(),
  /** Sessions created before this instant are invalid (reset ⇒ logout everywhere). */
  passwordChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Server-side, revocable sessions. The raw token lives only in the cookie. */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque cookie token. */
    tokenHash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Rolling — refreshed on use, powers the idle timeout. */
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Absolute expiry. */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_idx').on(table.tokenHash),
    index('auth_sessions_user_idx').on(table.userId),
    index('auth_sessions_expires_idx').on(table.expiresAt),
  ],
);

/** Optional TOTP 2FA. 1:1, cascade-deleted. */
export const authMfa = pgTable('auth_mfa', {
  userId: integer()
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  /** AES-256-GCM ciphertext of the TOTP seed, base64. Key lives outside the DB. */
  totpSecretEnc: text().notNull(),
  /** Null = enrolled but not yet confirmed with a valid code. */
  enabledAt: timestamp({ withTimezone: true }),
  /** SHA-256 hashes of one-time recovery codes — never the codes themselves. */
  recoveryCodes: text().array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Short-lived, one-shot tokens for email verification and password reset. */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    purpose: text().notNull(),
    /** SHA-256 of the token; the raw token is only in the emailed link. */
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    /** Set on use — a token works exactly once. */
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_tokens_token_idx').on(table.tokenHash),
    index('auth_tokens_user_idx').on(table.userId),
    check(
      'auth_tokens_purpose_check',
      sql`${table.purpose} in ('email_verify', 'password_reset')`,
    ),
  ],
);

/**
 * Durable rate-limit / lockout counters, keyed by `ip:<addr>` or `email:<addr>`.
 * In Postgres (not memory) so a deploy can't reset an attacker's throttle.
 */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    key: text().notNull(),
    windowStart: timestamp({ withTimezone: true }).notNull().defaultNow(),
    failures: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('auth_attempts_key_idx').on(table.key)],
);

/**
 * Append-only security log. Made insert-only by a trigger in the migration.
 * `detail` is redacted — never a password, token, or seed. `user_id` is nulled
 * (not cascaded away) when a user is deleted, so the audit trail survives.
 */
export const authAudit = pgTable(
  'auth_audit',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    event: text().notNull(),
    /**
     * The acting user's id, or null (e.g. a failed login for an unknown email).
     * Deliberately NOT a foreign key: the audit trail is append-only and must
     * survive a user's deletion without being mutated — a FK's ON DELETE action
     * would rewrite these rows, which the append-only trigger (rightly) forbids.
     */
    userId: integer(),
    ipAddress: text(),
    userAgent: text(),
    detail: jsonb(),
  },
  (table) => [
    index('auth_audit_at_idx').on(table.at),
    index('auth_audit_user_idx').on(table.userId),
  ],
);
