import { latestIndicatorsForInstruments, resolveInstrumentIds } from '@equitywise/db';
import { formatPaise } from '@equitywise/shared';
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateBreadcrumbSchema, generateItemListSchema, SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase, isDatabaseConfigured } from '@/server/db';
import { getIndex, listIndexKeys } from '@/server/indices';

export const revalidate = 3600; // 1-hour ISR

interface PageProps {
  params: Promise<{ sector: string }>;
}

interface SectorConstituentRow {
  symbol: string;
  name: string;
  close: number;
  changePercent: number | null;
  rsi14: number | null;
  ema50: number | null;
  ema200: number | null;
  high52w: number | null;
  low52w: number | null;
  relativeVolume: number | null;
}

async function getSectorData(sectorSlug: string) {
  const normalizedSlug = sectorSlug.toLowerCase().trim();
  let sectorName: string | null = null;
  const constituents: { symbol: string; name: string }[] = [];

  for (const key of await listIndexKeys().catch(() => [])) {
    const idx = await getIndex(key).catch(() => null);
    if (!idx) continue;
    for (const c of idx.constituents) {
      if (!c.sector || c.sector === 'Other') continue;
      const slug = c.sector
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      if (slug === normalizedSlug) {
        sectorName = c.sector;
        if (!constituents.some((item) => item.symbol === c.symbol)) {
          constituents.push({ symbol: c.symbol, name: c.name });
        }
      }
    }
  }

  if (!sectorName) return null;

  // Enrich with indicator data from DB if available
  const rows: SectorConstituentRow[] = [];
  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      const idMap = await resolveInstrumentIds(
        db,
        constituents.map((c) => c.symbol),
      );
      const ids = Array.from(idMap.values());
      const indicatorMap = await latestIndicatorsForInstruments(db, ids);

      for (const c of constituents) {
        const id = idMap.get(c.symbol);
        const ind = id ? indicatorMap.get(id) : null;
        rows.push({
          symbol: c.symbol,
          name: c.name,
          close: ind?.close ?? 0,
          changePercent: ind?.changePercent ?? null,
          rsi14: ind?.rsi14 ?? null,
          ema50: ind?.ema50 ?? null,
          ema200: ind?.ema200 ?? null,
          high52w: ind?.high52w ?? null,
          low52w: ind?.low52w ?? null,
          relativeVolume: ind?.relativeVolume ?? null,
        });
      }
    } catch {
      // Fallback
    }
  }

  // If DB rows weren't populated, use basic constituent data
  const finalRows =
    rows.length > 0
      ? rows
      : constituents.map((c) => ({
          symbol: c.symbol,
          name: c.name,
          close: 0,
          changePercent: null,
          rsi14: null,
          ema50: null,
          ema200: null,
          high52w: null,
          low52w: null,
          relativeVolume: null,
        }));

  return {
    name: sectorName,
    slug: normalizedSlug,
    constituents: finalRows,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sector: sectorSlug } = await params;
  const data = await getSectorData(sectorSlug);

  if (!data) {
    return {
      title: 'Sector Not Found — EquityWise',
      robots: { index: false },
    };
  }

  const canonicalUrl = `${SITE_URL}/sectors/${data.slug}`;
  const title = `${data.name} Sector Stocks in India — NSE Quotes & Analysis | EquityWise`;
  const description = `Explore all National Stock Exchange (NSE) stocks in the Indian ${data.name} sector. Track prices, 52-week ranges, moving averages, RSI, and technical indicators on EquityWise.`;

  return {
    title,
    description,
    keywords: [
      `${data.name} stocks India`,
      `${data.name} sector NSE`,
      `top ${data.name} companies`,
      `Indian ${data.name} share prices`,
    ],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function SectorDetailPage({ params }: PageProps) {
  const { sector: sectorSlug } = await params;
  const data = await getSectorData(sectorSlug);

  if (!data) {
    notFound();
  }

  const user = await getSessionUser();

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Market Sectors', path: '/sectors' },
    { name: `${data.name} Sector`, path: `/sectors/${data.slug}` },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
  const itemListSchema = generateItemListSchema({
    name: `Indian ${data.name} Sector Stocks`,
    description: `List of active equities in the ${data.name} sector listed on the National Stock Exchange of India.`,
    url: `${SITE_URL}/sectors/${data.slug}`,
    items: data.constituents.map((s) => ({
      name: `${s.name} (${s.symbol})`,
      url: `/stocks/${s.symbol.toLowerCase()}`,
    })),
  });

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <JsonLd schema={breadcrumbSchema} />
      <JsonLd schema={itemListSchema} />

      <PublicHeader signedIn={user !== null} />

      <main className="flex-1 pb-16">
        <div className="border-b border-border/50 bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Link href="/" className="hover:text-foreground">
                Home
              </Link>
              <ChevronRightIcon className="size-3.5 text-subtle-foreground" />
              <Link href="/sectors" className="hover:text-foreground">
                Sectors
              </Link>
              <ChevronRightIcon className="size-3.5 text-subtle-foreground" />
              <span className="font-medium text-foreground">{data.name}</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-3 text-2xs uppercase">
                NSE Industry Sector
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {data.name} Sector Stocks in India
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Track and compare all {data.constituents.length} key National Stock Exchange (NSE)
                companies in the {data.name} sector. Real-time technical readings, 52-week ranges,
                and moving average trends.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {data.constituents.length} companies in {data.name}
            </span>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/sectors">
                <ArrowLeftIcon className="size-3.5 mr-1" />
                All Sectors
              </Link>
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/80 bg-surface/30">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-3 font-medium">Company</th>
                  <th className="p-3 font-medium">Close (LTP)</th>
                  <th className="p-3 font-medium">Daily Change</th>
                  <th className="p-3 font-medium">RSI (14)</th>
                  <th className="p-3 font-medium">50 EMA</th>
                  <th className="p-3 font-medium">200 EMA</th>
                  <th className="p-3 font-medium">52W High</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-mono">
                {data.constituents.map((stock) => {
                  const isPositive = (stock.changePercent ?? 0) >= 0;
                  return (
                    <tr key={stock.symbol} className="transition-colors hover:bg-surface/70">
                      <td className="p-3 font-sans">
                        <Link
                          href={`/stocks/${stock.symbol.toLowerCase()}`}
                          className="font-medium text-foreground hover:text-primary underline-offset-4 hover:underline"
                        >
                          {stock.symbol}
                        </Link>
                        <span className="block text-3xs text-muted-foreground">{stock.name}</span>
                      </td>
                      <td className="p-3 text-foreground font-semibold">
                        {stock.close > 0 ? formatPaise(stock.close) : '—'}
                      </td>
                      <td className="p-3">
                        {stock.changePercent != null ? (
                          <span
                            className={`inline-flex items-center gap-0.5 ${isPositive ? 'text-bullish' : 'text-bearish'}`}
                          >
                            {isPositive ? '+' : ''}
                            {stock.changePercent.toFixed(2)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 text-foreground">
                        {stock.rsi14 != null ? stock.rsi14.toFixed(1) : '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {stock.ema50 ? formatPaise(stock.ema50) : '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {stock.ema200 ? formatPaise(stock.ema200) : '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {stock.high52w ? formatPaise(stock.high52w) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
