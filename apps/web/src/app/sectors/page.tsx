import { ArrowRightIcon, ChevronRightIcon, LayoutGridIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { generateBreadcrumbSchema, generateItemListSchema, SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';
import { getIndex, listIndexKeys } from '@/server/indices';

export const revalidate = 86400; // 24-hour ISR

export const metadata: Metadata = {
  title: 'Indian Stock Market Sectors — NSE Sectoral Analysis | EquityWise',
  description:
    'Explore Indian equity sectors on the National Stock Exchange (NSE). Track banking, IT, energy, auto, pharma, and FMCG stocks with technical indicators on EquityWise.',
  alternates: {
    canonical: '/sectors',
  },
  openGraph: {
    title: 'Indian Stock Market Sectors — EquityWise',
    description: 'Explore Indian equity sectors and constituent stocks with technical indicators.',
    url: `${SITE_URL}/sectors`,
  },
};

interface SectorInfo {
  readonly name: string;
  readonly slug: string;
  readonly count: number;
  readonly sampleConstituents: readonly string[];
}

export default async function SectorsHubPage() {
  const user = await getSessionUser();

  const sectorMap = new Map<string, { name: string; constituents: string[] }>();

  for (const key of await listIndexKeys().catch(() => [])) {
    const idx = await getIndex(key).catch(() => null);
    if (!idx) continue;
    for (const c of idx.constituents) {
      const sectorName = c.sector ?? 'Other';
      if (sectorName === 'Other') continue;
      const current = sectorMap.get(sectorName) ?? { name: sectorName, constituents: [] };
      if (!current.constituents.includes(c.symbol)) {
        current.constituents.push(c.symbol);
      }
      sectorMap.set(sectorName, current);
    }
  }

  const sectors: SectorInfo[] = Array.from(sectorMap.values())
    .map((s) => ({
      name: s.name,
      slug: s.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
      count: s.constituents.length,
      sampleConstituents: s.constituents.slice(0, 4),
    }))
    .sort((a, b) => b.count - a.count);

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Market Sectors', path: '/sectors' },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
  const itemListSchema = generateItemListSchema({
    name: 'National Stock Exchange (NSE) Market Sectors',
    description: 'Directory of Indian equity sectors and constituent companies.',
    url: `${SITE_URL}/sectors`,
    items: sectors.map((s) => ({
      name: `${s.name} Sector`,
      url: `/sectors/${s.slug}`,
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
              <span className="font-medium text-foreground">Market Sectors</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Sector Classification
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Indian Stock Market Sectors
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Discover top NSE companies grouped by industry sectors. Analyze sector constituents,
              technical setups, and relative strength across the Indian equity universe.
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sectors.map((sec) => (
              <Link
                key={sec.slug}
                href={`/sectors/${sec.slug}`}
                className="group flex flex-col justify-between rounded-xl border border-border/80 bg-surface/30 p-5 transition-all hover:border-foreground/30 hover:bg-surface/70"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                      <LayoutGridIcon className="size-4" />
                    </span>
                    <Badge variant="secondary" size="sm" className="text-3xs font-mono">
                      {sec.count} Stocks
                    </Badge>
                  </div>

                  <h2 className="mt-4 text-base font-semibold text-foreground group-hover:text-primary">
                    {sec.name} Sector
                  </h2>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {sec.sampleConstituents.map((c) => (
                      <span
                        key={c}
                        className="rounded bg-background/80 px-1.5 py-0.5 text-3xs font-mono text-muted-foreground"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3 text-2xs text-subtle-foreground">
                  <span>Explore {sec.name} stocks</span>
                  <ArrowRightIcon className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
