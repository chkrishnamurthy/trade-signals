import type { MetadataRoute } from 'next';
import { MOBILE_TABS } from '@/lib/navigation';
import { PWA_COLORS, PWA_START_URL } from '@/lib/pwa';
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo/schema';

/**
 * The web app manifest, served at `/manifest.webmanifest` (outside the
 * middleware matcher, so it is public) and linked from every page by Next.
 *
 * `id` is the installed app's identity: changing it makes every installed copy
 * a different app. Never change it (docs/planning/pwa-plan.md §3.1).
 */
export default function manifest(): MetadataRoute.Manifest {
  const shortcutIds = new Set(['watchlists', 'screener', 'portfolio']);
  const shortcuts = MOBILE_TABS.filter((item) => shortcutIds.has(item.id)).map((item) => ({
    name: item.label,
    short_name: item.shortLabel ?? item.label,
    description: item.description,
    url: item.href,
  }));

  return {
    id: '/',
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: PWA_START_URL,
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    theme_color: PWA_COLORS.lightSurface,
    background_color: PWA_COLORS.lightBackground,
    categories: ['finance', 'business'],
    lang: 'en-IN',
    dir: 'ltr',
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      ...shortcuts,
      {
        name: 'IPOs',
        short_name: 'IPOs',
        description: 'Mainboard and SME public issues',
        url: '/ipos',
      },
    ],
    // Not yet in Next's manifest type; Chromium reuses the open window for
    // shortcuts and notification clicks instead of opening another.
    ...({ launch_handler: { client_mode: ['navigate-existing', 'auto'] } } as object),
  };
}
