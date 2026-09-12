import { latestIndicatorDate, listActiveInstruments } from '@equitywise/db';
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/schema';
import { getDatabase, isDatabaseConfigured } from '@/server/db';
import { getIndex, listIndexKeys } from '@/server/indices';

export const revalidate = 86400; // 24 hours

export const SCREENER_PRESETS = [
  { slug: '52-week-high', name: '52-Week High Stocks' },
  { slug: '52-week-low', name: '52-Week Low Stocks' },
  { slug: 'rsi-oversold', name: 'RSI Oversold Stocks' },
  { slug: 'rsi-overbought', name: 'RSI Overbought Stocks' },
  { slug: 'golden-cross', name: 'Golden Cross (Bullish EMA Stack)' },
  { slug: 'volume-breakout', name: 'High Volume Breakout Stocks' },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  let latestDate: Date = now;

  // Static high-authority public pages
  const staticUrls: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/stocks`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/screener`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/sectors`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/methodology`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/data-sources`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/disclaimer`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  // Screener preset URLs
  const screenerUrls: MetadataRoute.Sitemap = SCREENER_PRESETS.map((preset) => ({
    url: `${SITE_URL}/screener/${preset.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // Unique sectors from configured indices
  const sectorSet = new Set<string>();
  const fallbackStocks = new Map<string, string>();

  for (const key of await listIndexKeys().catch(() => [])) {
    const idx = await getIndex(key).catch(() => null);
    if (!idx) continue;
    for (const c of idx.constituents) {
      if (c.sector && c.sector !== 'Other') {
        sectorSet.add(
          c.sector
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''),
        );
      }
      fallbackStocks.set(c.symbol.toLowerCase(), c.symbol);
    }
  }

  const sectorUrls: MetadataRoute.Sitemap = Array.from(sectorSet).map((sectorSlug) => ({
    url: `${SITE_URL}/sectors/${sectorSlug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Dynamic stock URLs
  let stockSymbols = Array.from(fallbackStocks.keys());

  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      const lastSession = await latestIndicatorDate(db);
      if (lastSession) {
        latestDate = new Date(`${lastSession}T15:30:00+05:30`);
      }
      const instruments = await listActiveInstruments(db, 'equity');
      if (instruments.length > 0) {
        stockSymbols = instruments.map((inst) => inst.symbol.toLowerCase());
      }
    } catch {
      // Fallback already populated from config
    }
  }

  const stockUrls: MetadataRoute.Sitemap = stockSymbols.map((symbol) => ({
    url: `${SITE_URL}/stocks/${symbol}`,
    lastModified: latestDate,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [...staticUrls, ...screenerUrls, ...sectorUrls, ...stockUrls];
}
