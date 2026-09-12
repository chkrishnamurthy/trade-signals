import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/schema';

/**
 * Production robots.txt configuration for EquityWise.io.
 *
 * Directs search engine crawlers to high-value public pages:
 * - Homepage and the Trust, Methodology & Legal pages.
 *
 * Prevents crawling and indexing of:
 * - Internal APIs (/api/*)
 * - User-private areas (/watchlists/*, /profile/*, /admin/*)
 * - Auth flow pages (/login, /signup, /reset, /verify, /account/*)
 * - Duplicate query parameters
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/about',
          '/methodology',
          '/data-sources',
          '/disclaimer',
          '/contact',
          '/terms',
          '/privacy',
          '/*.png',
          '/*.jpg',
          '/*.svg',
          '/*.css',
          '/*.js',
        ],
        disallow: [
          '/api/',
          '/admin',
          '/admin/*',
          '/today',
          '/announcements',
          '/flows',
          '/watchlists',
          '/watchlists/*',
          '/profile',
          '/profile/*',
          '/login',
          '/signup',
          '/reset',
          '/verify',
          '/account/',
          '/account/*',
          '/*?*', // Prevent crawl budget waste on arbitrary query combinations
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
