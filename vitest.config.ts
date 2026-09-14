import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
    include: ['{apps,packages}/*/src/**/*.{test,spec}.ts'],
    environment: 'node',
    // Migrates the local test database once before any DB-backed suite. A no-op
    // when TEST_DATABASE_URL is unset (those suites then skip). See test/db.ts.
    globalSetup: ['./test/global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.{test,spec}.ts', '**/index.ts'],
    },
  },
});
