import { listActiveInstruments } from '@equitywise/db';
import { ChevronRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
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

export const metadata: Metadata = {
  title: 'All NSE Stocks Directory — Share Prices & Technical Analysis',
  description:
    'Browse all National Stock Exchange (NSE) listed equities. Discover live share prices, 52-week ranges, RSI, moving averages, and technical indicators on EquityWise.',
  alternates: {
    canonical: '/stocks',
  },
  openGraph: {
    title: 'All NSE Stocks Directory — EquityWise',
    description:
      'Browse all National Stock Exchange (NSE) listed equities with technical indicators and price analysis.',
    url: `${SITE_URL}/stocks`,
  },
};

interface StockEntry {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
}

export default async function StocksDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string; q?: string }>;
}) {
  const user = await getSessionUser();
  const { letter, q } = await searchParams;

  const stockMap = new Map<string, StockEntry>();

  // 1. First populate from configured indices (with curated sectors)
  for (const key of await listIndexKeys().catch(() => [])) {
    const idx = await getIndex(key).catch(() => null);
    if (!idx) continue;
    for (const c of idx.constituents) {
      stockMap.set(c.symbol.toUpperCase(), {
        symbol: c.symbol,
        name: c.name,
        sector: c.sector ?? 'Equities',
      });
    }
  }

  // 2. Enrich from DB if configured
  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      const activeRows = await listActiveInstruments(db, 'equity');
      for (const row of activeRows) {
        if (!stockMap.has(row.symbol.toUpperCase())) {
          stockMap.set(row.symbol.toUpperCase(), {
            symbol: row.symbol,
            name: row.name,
            sector: 'Equities',
          });
        }
      }
    } catch {
      // Degrades gracefully
    }
  }

  let allStocks = Array.from(stockMap.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Filter by letter if present
  if (letter && letter.length === 1) {
    const targetLetter = letter.toUpperCase();
    allStocks = allStocks.filter((s) => s.symbol.startsWith(targetLetter));
  }

  // Filter by query if present
  if (q && q.trim().length > 0) {
    const query = q.trim().toUpperCase();
    allStocks = allStocks.filter(
      (s) => s.symbol.includes(query) || s.name.toUpperCase().includes(query),
    );
  }

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Stocks', path: '/stocks' },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
  const itemListSchema = generateItemListSchema({
    name: 'National Stock Exchange (NSE) Equities Directory',
    description:
      'Comprehensive directory of active equities listed on the National Stock Exchange of India.',
    url: `${SITE_URL}/stocks`,
    items: allStocks.slice(0, 50).map((s) => ({
      name: `${s.name} (${s.symbol})`,
      url: `/stocks/${s.symbol.toLowerCase()}`,
    })),
  });

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <JsonLd schema={breadcrumbSchema} />
      <JsonLd schema={itemListSchema} />

      <PublicHeader signedIn={user !== null} />

      <main className="flex-1 pb-16">
        {/* Breadcrumb Navigation */}
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
              <span className="font-medium text-foreground">Stocks Directory</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-3 text-2xs uppercase">
                NSE Listed Companies
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                NSE Stocks Directory
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Explore share prices, moving averages, RSI, and technical indicators for all
                National Stock Exchange (NSE) listed companies.
              </p>
            </div>

            {/* A-Z Alphabetical Filter Bar */}
            <div className="mt-6 flex flex-wrap gap-1 border-t border-border/50 pt-4">
              <Link
                href="/stocks"
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  !letter
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                All
              </Link>
              {alphabet.map((char) => (
                <Link
                  key={char}
                  href={`/stocks?letter=${char}`}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    letter === char
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {char}
                </Link>
              ))}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {allStocks.length} equities</span>
            {letter && <span>Filtered by letter "{letter}"</span>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {allStocks.map((stock) => (
              <Link
                key={stock.symbol}
                href={`/stocks/${stock.symbol.toLowerCase()}`}
                className="group flex flex-col justify-between rounded-lg border border-border/70 bg-surface/30 p-4 transition-all hover:border-foreground/30 hover:bg-surface/70"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-foreground group-hover:text-primary">
                      {stock.symbol}
                    </span>
                    <Badge variant="secondary" size="sm" className="text-3xs">
                      {stock.sector}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{stock.name}</p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-2xs text-subtle-foreground">
                  <span>View technical analysis</span>
                  <ChevronRightIcon className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>

          {allStocks.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">
                No stocks found matching the criteria.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/stocks">View All Stocks</Link>
              </Button>
            </div>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
