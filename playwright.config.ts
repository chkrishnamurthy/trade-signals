import { defineConfig, devices } from '@playwright/test';

const port = 3000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @equitywise/web start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_BASE_URL: baseURL,
      AUTH_TRUSTED_ORIGINS: baseURL,
      AUTH_SESSION_SECRET: 'release-smoke-only-session-secret-at-least-32-bytes',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
