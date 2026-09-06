import { config as loadEnv } from 'dotenv';
import { createDatabase, getUserForLogin, setUserRole } from '@equitywise/db';

/**
 * Promote or demote an account's role.
 *
 * There is deliberately no UI for this — the only way to become an admin is to
 * run this script over SSH, so there is no admin-granting endpoint to attack.
 *
 *   pnpm tsx scripts/auth-set-role.ts you@example.com admin
 *   pnpm tsx scripts/auth-set-role.ts someone@example.com user
 */
loadEnv();

async function main(): Promise<void> {
  const [rawEmail, rawRole = 'admin'] = process.argv.slice(2);
  if (rawEmail === undefined || rawEmail === '') {
    console.error('usage: tsx scripts/auth-set-role.ts <email> [user|admin]');
    process.exit(1);
  }
  if (rawRole !== 'user' && rawRole !== 'admin') {
    console.error(`role must be "user" or "admin", got "${rawRole}"`);
    process.exit(1);
  }

  const email = rawEmail.trim().toLowerCase();
  const handle = createDatabase();
  try {
    const found = await getUserForLogin(handle.db, email);
    if (found === null) {
      console.error(`no account found for ${email}`);
      process.exit(1);
    }
    await setUserRole(handle.db, found.user.id, rawRole);
    console.log(`${email} (id ${found.user.id}) is now ${rawRole}.`);
  } finally {
    await handle.close();
  }
}

void main();
