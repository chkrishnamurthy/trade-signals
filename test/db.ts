import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// Pick up a TEST_DATABASE_URL written into the repo-root .env, the same way the
// app's other config is loaded. A value already in the environment (CI, or the
// integration script) wins — dotenv never overwrites an existing variable.
loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

/**
 * The disposable Postgres the DB-backed test suites run against.
 *
 * ONE database for every integration suite: local, throwaway, and named `*_test`.
 * `docker-compose.test.yml` brings up the matching stack (Postgres 17 +
 * TimescaleDB, exactly what the VPS runs); the Vitest global setup migrates it
 * once before any suite; the suites themselves only connect and insert.
 *
 * Resolution rules — chosen so coverage can never silently disappear:
 *
 *   - unset and NOT in CI  -> `undefined`. The DB suites `describe.skip`, so a
 *     machine without Docker still runs every pure test.
 *   - unset and in CI      -> throws. CI always has the container up, so a
 *     missing URL is a broken workflow, not a reason to skip the DB-enforced
 *     invariants. This is what replaces the old "no credentials -> silent skip"
 *     that let the schema tests stop running unnoticed.
 *   - set but not a LOCAL `*_test` database -> throws before anything connects,
 *     so a test run can never migrate or truncate a real database.
 */
export function resolveTestDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url === '') {
    if (process.env.CI !== undefined && process.env.CI !== '') {
      throw new Error(
        'TEST_DATABASE_URL is required in CI but is unset. Start the test database ' +
          '(pnpm test:db:up) and export its URL, or run `pnpm test:integration`. ' +
          'See docker-compose.test.yml.',
      );
    }
    return undefined;
  }

  const parsed = new URL(url);
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (!isLocal || !parsed.pathname.endsWith('_test')) {
    throw new Error(
      `Refusing TEST_DATABASE_URL="${url}". Integration tests require a LOCAL, ` +
        'disposable database whose name ends in "_test". This guard exists so a ' +
        'test run can never migrate or truncate a real database.',
    );
  }
  return url;
}
