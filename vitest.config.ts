import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.{test,spec}.ts', '**/index.ts'],
    },
  },
});
