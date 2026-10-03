import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * The suites that write to the one shared test database. They insert without
 * cleaning up, so two of them running at once read each other's rows (paper,
 * intraday and watchlist suites failed at random under parallel files). They
 * run one file at a time; everything else stays parallel.
 */
const DB_SUITES = [
  'packages/db/src/__tests__/**/*.test.ts',
  '{apps,packages}/*/src/**/*.db.test.ts',
];

export default defineConfig({
  // Match Next's automatic JSX runtime for server-rendered component tests.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      // The same `@/` the web app uses. Without it a test cannot reach a web
      // module by the path the app itself imports it by, which in practice
      // means the component layer never gets asserted against at all.
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      // `server-only` throws when imported outside Next's server bundler; under
      // Vitest (plain Node) it must be a no-op so server modules stay testable.
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Migrates the local test database once before any DB-backed suite. A no-op
    // when TEST_DATABASE_URL is unset (those suites then skip). See test/db.ts.
    globalSetup: ['./test/global-setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['{apps,packages}/*/src/**/*.{test,spec}.ts'],
          exclude: [...configDefaults.exclude, ...DB_SUITES],
        },
      },
      {
        extends: true,
        // One process, one file after another: the suites share a database.
        test: {
          name: 'db',
          include: DB_SUITES,
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.{test,spec}.ts', '**/index.ts'],
    },
  },
});
