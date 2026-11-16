import { expect, test } from '@playwright/test';

/**
 * PWA smoke checks (docs/planning/pwa-plan.md §3.6) — public files only, so
 * they need no account and no data.
 */

test('manifest is public and installable-shaped', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Record<string, unknown>;
  expect(manifest.id).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(String(manifest.start_url)).toMatch(/^\/today/);
  const icons = manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;
  expect(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBe(true);
  for (const icon of icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test('service worker is served uncached and only handles navigations', async ({ request }) => {
  const response = await request.get('/sw.js');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('javascript');
  expect(response.headers()['cache-control']).toContain('no-store');
  const source = await response.text();
  expect(source).toContain('/offline.html');
  expect(source).not.toMatch(/cache\.put\(/);
});

test('offline page is public and static', async ({ request }) => {
  const response = await request.get('/offline.html');
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("You're offline");
});

test('pages carry the install metadata', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    /manifest\.webmanifest/,
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'browser');
});
