import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { resolveTestDatabaseUrl } from './db';

const execFileAsync = promisify(execFile);

/**
 * Vitest global setup — migrates the test database ONCE per run.
 *
 * The DB suites used to each migrate their own throwaway database, per file,
 * which was slow and duplicated. Here the schema is applied a single time before
 * any suite; the suites just connect and assert.
 *
 * A no-op when no test database is configured (local dev without Docker): the
 * suites skip. `resolveTestDatabaseUrl` still throws in CI, or on a non-local
 * URL, so a misconfiguration fails loudly instead of silently skipping.
 */
export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  if (url === undefined) return;

  const dbPackageRoot = fileURLToPath(new URL('../packages/db/', import.meta.url));
  // drizzle-kit reads DATABASE_URL_DIRECT (packages/db/drizzle.config.ts). Point
  // it at the test database for this run only; the value we pass is already in
  // the child's env, so the config's dotenv load will not overwrite it.
  await execFileAsync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
    cwd: dbPackageRoot,
    env: { ...process.env, DATABASE_URL_DIRECT: url },
  });
}
