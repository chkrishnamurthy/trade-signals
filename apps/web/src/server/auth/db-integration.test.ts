import {
  createDatabase,
  createSession,
  createUser,
  type DatabaseHandle,
  deleteSession,
  deleteUser,
  getSessionContext,
  getUserForLogin,
  getUserWithProfile,
} from '@equitywise/db';
import { afterAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';
import { generateSessionToken, hashToken } from './session-token';

/**
 * End-to-end check of the auth data layer against a real Postgres. Skipped unless
 * AUTH_TEST_DB points at a throwaway database — it never touches production.
 *
 *   AUTH_TEST_DB="postgresql://equitywise:devpass@localhost:5433/nse_signals" \
 *     npx vitest run apps/web/src/server/auth/db-integration.test.ts
 */
const url = process.env.AUTH_TEST_DB;
const suite = url ? describe : describe.skip;

suite('auth data layer (integration)', () => {
  const handle: DatabaseHandle = createDatabase({ connectionString: url ?? '' });
  const db = handle.db;
  const email = `smoke-${Date.now()}@example.com`;
  const password = 'a strong integration passphrase';
  let userId = 0;

  afterAll(async () => {
    if (userId !== 0) await deleteUser(db, userId);
    await handle.close();
  });

  it('creates a user with profile + credential', async () => {
    const user = await createUser(db, {
      email,
      displayName: 'Smoke Test',
      passwordHash: await hashPassword(password),
      termsAcceptedAt: new Date(),
    });
    userId = user.id;
    expect(user.role).toBe('user');
    expect(user.status).toBe('active');

    const full = await getUserWithProfile(db, userId);
    expect(full?.profile.displayName).toBe('Smoke Test');
    expect(full?.profile.timezone).toBe('Asia/Kolkata');
  });

  it('finds the user for login and verifies the password', async () => {
    const found = await getUserForLogin(db, email);
    expect(found).not.toBeNull();
    expect(await verifyPassword(found?.passwordHash ?? '', password)).toBe(true);
    expect(await verifyPassword(found?.passwordHash ?? '', 'wrong password')).toBe(false);
  });

  it('creates, resolves, and revokes a session', async () => {
    const token = generateSessionToken();
    await createSession(db, {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 86_400_000),
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    const ctx = await getSessionContext(db, hashToken(token));
    expect(ctx?.user.id).toBe(userId);
    expect(ctx?.session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await deleteSession(db, hashToken(token));
    expect(await getSessionContext(db, hashToken(token))).toBeNull();
  });

  it('cascade-deletes profile + credential with the user', async () => {
    const throwaway = await createUser(db, {
      email: `cascade-${Date.now()}@example.com`,
      displayName: 'Cascade',
      passwordHash: await hashPassword(password),
      termsAcceptedAt: new Date(),
    });
    await deleteUser(db, throwaway.id);
    expect(await getUserWithProfile(db, throwaway.id)).toBeNull();
    expect(await getUserForLogin(db, `cascade-${throwaway.id}`)).toBeNull();
  });
});
