import { type ScreenerRow, screen } from '@equitywise/db';
import { formatPaise } from '@equitywise/shared';
import {
  ArrowRightIcon,
  BarChart3Icon,
  LayersIcon,
  LineChartIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SCREENER_PRESETS } from '@/app/sitemap';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase, isDatabaseConfigured } from '@/server/db';
import { getHeadlineIndices } from '@/server/indices';

export const revalidate = 60; // ISR 1 minute

export const metadata: Metadata = {
  title: 'EquityWise — NSE Stock Analysis, Technical Indicators & Screener',
  description:
    'Track, screen and analyse National Stock Exchange (NSE) equities with high-precision technical indicators, moving averages, RSI, and volume breakouts.',
  alternates: {
    canonical: '/',
  },
};

export default async function HomePage() {
  const user = await getSessionUser();
  const headlineIndices = await getHeadlineIndices().catch(() => []);

  // Fetch top market gainers from precomputed daily indicators
  let topGainers: readonly ScreenerRow[] = [];
  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      const result = await screen(db, {
        sort: 'change_desc',
        limit: 6,
        filters: [],
      });
      topGainers = result.rows;
    } catch {
      // Degrades gracefully to empty if DB is cold
    }
  }

  // Load configured sectors
  const sectorList = [
    { name: 'Banking', slug: 'banking', count: 12 },
    { name: 'Information Technology', slug: 'it', count: 6 },
    { name: 'Automobile', slug: 'auto', count: 6 },
    { name: 'Energy & Power', slug: 'energy', count: 5 },
    { name: 'Pharmaceuticals', slug: 'pharma', count: 4 },
    { name: 'Metals & Mining', slug: 'metals', count: 5 },
    { name: 'FMCG', slug: 'fmcg', count: 5 },
    { name: 'Infrastructure', slug: 'infrastructure', count: 4 },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader signedIn={user !== null} />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border/50 bg-linear-to-b from-surface/80 to-background py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <Badge
                variant="outline"
                className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 text-xs"
              >
                <span className="size-1.5 rounded-full bg-bullish" />
                Live NSE Market Data & Technical Indicators
              </Badge>

              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl sm:leading-tight">
                NSE Stock Analysis, Technical Indicators & Screener
              </h1>

              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                High-precision technical decision support for Indian equities. Screen across RSI,
                20/50/200 EMAs, 52-week extremes, and volume anomalies with zero lookahead bias.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Button asChild size="lg" variant="default" className="gap-2">
                  <Link href="/screener">
                    <SlidersHorizontalIcon className="size-4" />
                    Launch Stock Screener
                  </Link>
                </Button>

                <Button asChild size="lg" variant="outline" className="gap-2">
                  <Link href="/stocks">
                    <LineChartIcon className="size-4" />
                    Explore NSE Stocks
                  </Link>
                </Button>
              </div>

              {user !== null && (
                <div className="mt-6 inline-block rounded-lg border border-border/80 bg-surface/60 px-4 py-2 text-xs text-muted-foreground">
                  Signed in as <strong className="text-foreground">{user.email}</strong>.{' '}
                  <Link
                    href="/watchlists"
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Open Your Watchlists &rarr;
                  </Link>
                </div>
              )}
            </div>

            {/* Headline Benchmark Tickers */}
            {headlineIndices.length > 0 && (
              <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {headlineIndices.map((idx) => (
                  <div
                    key={idx.symbol}
                    className="flex flex-col justify-between rounded-lg border border-border/70 bg-surface/50 p-4 transition-colors hover:border-border"
                  >
                    <span className="text-xs font-semibold text-muted-foreground">{idx.name}</span>
                    <span className="mt-1 font-mono text-lg font-semibold tracking-tight text-foreground">
                      {idx.symbol}
                    </span>
                    <span className="mt-1 text-2xs text-subtle-foreground uppercase tracking-wider">
                      Benchmark Index
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Top Market Gainers (if present) */}
        {topGainers.length > 0 && (
          <section className="border-b border-border/50 bg-surface/20 py-12">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    Top Session Gainers
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    NSE equities with highest percentage price advances.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs">
                  <Link href="/stocks">All Stocks &rarr;</Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {topGainers.map((stock) => (
                  <Link
                    key={stock.symbol}
                    href={`/stocks/${stock.symbol.toLowerCase()}`}
                    className="flex flex-col justify-between rounded-lg border border-border/70 bg-background/80 p-3 transition-colors hover:border-foreground/30 hover:bg-surface/80"
                  >
                    <div>
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {stock.symbol}
                      </span>
                      <span className="block truncate text-3xs text-muted-foreground">
                        {stock.name}
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {formatPaise(stock.close)}
                      </span>
                      {stock.changePercent != null && (
                        <span className="font-mono text-3xs font-medium text-bullish">
                          +{stock.changePercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Top Market Setups / Daily Screeners */}
        <section className="border-b border-border/50 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Popular Technical Screeners
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crawlable rule-based scans updated at every NSE trading close.
                </p>
              </div>

              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link href="/screener">
                  View All Screeners
                  <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SCREENER_PRESETS.map((preset) => (
                <Link
                  key={preset.slug}
                  href={`/screener/${preset.slug}`}
                  className="group flex flex-col justify-between rounded-xl border border-border/80 bg-surface/40 p-5 transition-all hover:border-foreground/30 hover:bg-surface/80"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <BarChart3Icon className="size-4" />
                      </span>
                      <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">{preset.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Scan active NSE equities meeting the {preset.name.toLowerCase()} technical
                      criteria.
                    </p>
                  </div>
                  <div className="mt-4 border-t border-border/50 pt-3 text-2xs font-medium text-subtle-foreground uppercase tracking-wider">
                    Preset Screen &rarr;
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Sectors Overview */}
        <section className="border-b border-border/50 py-16 bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Market Sectors
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Explore top companies grouped by industry and sector classification.
                </p>
              </div>

              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link href="/sectors">
                  All Sectors
                  <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {sectorList.map((sec) => (
                <Link
                  key={sec.slug}
                  href={`/sectors/${sec.slug}`}
                  className="flex flex-col justify-between rounded-lg border border-border/70 bg-background/80 p-4 transition-colors hover:border-foreground/40 hover:bg-surface/60"
                >
                  <span className="text-sm font-semibold text-foreground">{sec.name}</span>
                  <div className="mt-3 flex items-center justify-between text-2xs text-muted-foreground">
                    <span>{sec.count} Constituents</span>
                    <ArrowRightIcon className="size-3 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Platform Integrity & Rigor (E-E-A-T) */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Engineered for Algorithmic & Analytical Integrity
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We believe financial tools should never compromise on computational correctness.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="rounded-xl border border-border/80 bg-surface/40 p-6">
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheckIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  Zero Lookahead Bias
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Indicators and signals compute exclusively on closed session bars. Tradeable
                  triggers assume execution strictly on subsequent candle opens.
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-surface/40 p-6">
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <LayersIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  Integer Paise Arithmetic
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  All price levels are stored and calculated in whole integer paise (e.g. ₹1,245.50
                  = 124550), eliminating binary floating-point roundoff errors completely.
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-surface/40 p-6">
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <TrendingUpIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  Corporate Action Adjustments
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Splits, bonuses, and consolidations are applied on read with exact numeric ratios,
                  guaranteeing historical continuity without mutating raw candle records.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
