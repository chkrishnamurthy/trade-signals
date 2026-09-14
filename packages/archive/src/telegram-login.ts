import { createInterface } from 'node:readline/promises';
import { createClient, readSavedSession, SESSION_PATH, saveSession } from './telegram-env.js';

/**
 * One-time interactive Telegram login for the archive tooling.
 *
 * You run this; it asks for your phone number, the login code Telegram sends
 * you, and your 2FA password if you have one. Those are typed into this
 * terminal and never leave the machine. On success it saves a session token to
 * a gitignored local file so later scripts connect without asking again.
 *
 * Usage:  pnpm --filter @equitywise/archive tg:login
 */
async function main(): Promise<void> {
  const existing = await readSavedSession();
  const client = createClient(existing);

  if (existing) {
    // Already have a session — just verify it still works.
    await client.connect();
    const me = await client.getMe();
    const name = 'username' in me && me.username ? `@${me.username}` : (me.firstName ?? 'unknown');
    console.log(`Already logged in as ${name}. Session file: ${SESSION_PATH}`);
    await client.disconnect();
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await client.start({
      phoneNumber: async () =>
        (await rl.question('Phone number (with country code, e.g. +91...): ')).trim(),
      phoneCode: async () => (await rl.question('Login code Telegram just sent you: ')).trim(),
      password: async () => (await rl.question('2FA password (leave blank if none): ')).trim(),
      onError: (err) => console.error('Login error:', err),
    });
  } finally {
    rl.close();
  }

  const session = String(client.session.save());
  await saveSession(session);
  const me = await client.getMe();
  const name = 'username' in me && me.username ? `@${me.username}` : (me.firstName ?? 'unknown');
  console.log(`\nLogged in as ${name}. Session saved to ${SESSION_PATH}`);
  console.log('Next: pnpm --filter @equitywise/archive tg:list');
  await client.disconnect();
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
