import { expect, test } from '@playwright/test';

test.describe('public release smoke', () => {
  test('landing page explains the product and exposes the public tour', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Know why a stock deserves your attention.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'See it before you sign up' })).toBeVisible();
  });

  test('public trust pages render without authentication', async ({ page }) => {
    for (const path of ['/about', '/methodology', '/data-sources', '/privacy', '/terms']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator('h1'), path).toBeVisible();
    }
  });

  test('protected pages preserve their destination through sign in', async ({ page }) => {
    await page.goto('/today');

    await expect(page).toHaveURL(/\/login\?next=%2Ftoday$/u);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('protected APIs return the shared unauthenticated JSON shape', async ({ request }) => {
    const response = await request.get('/api/watchlists');

    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'UNAUTHENTICATED',
      error: 'Not signed in.',
    });
  });

  test('security and crawler metadata ship in the production server', async ({ request }) => {
    const home = await request.get('/');
    expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(home.headers()['strict-transport-security']).toContain('max-age=63072000');
    expect(home.headers()['x-content-type-options']).toBe('nosniff');

    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap:');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<urlset');
  });
});
