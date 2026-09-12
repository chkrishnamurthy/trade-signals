import { type ScreenerRow, screen } from '@equitywise/db';
import { formatPaise } from '@equitywise/shared';
import { BarChart3Icon, ChevronRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SCREENER_PRESETS } from '@/app/sitemap';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateBreadcrumbSchema, generateItemListSchema, SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';
import { getDatabase, isDatabaseConfigured } from '@/server/db';

export const revalidate = 300; // 5-minute ISR

export const metadata: Metadata = {
  title: 'NSE Stock Screener — Technical Indicators & Momentum Scans',
  description:
    'Institutional-grade technical stock screener for Indian equities (NSE). Filter by RSI, 20/50/200 EMAs, 52-week highs, golden crosses, and relative volume anomalies.',
  alternates: {
    canonical: '/screener',
  },
  openGraph: {
    title: 'NSE Stock Screener — Technical Indicators & Momentum Scans',
    description:
      'Filter Indian stocks by RSI, 20/50/200 EMAs, 52-week highs, and volume breakouts.',
    url: `${SITE_URL}/screener`,
  },
};

export default async function ScreenerHubPage() {
  const user = await getSessionUser();

  let rows: readonly ScreenerRow[] = [];
  let tradingDate: string | null = null;
  let totalCount = 0;

  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      const result = await screen(db, {
        filters: [],
        sort: 'relative_volume_desc',
        limit: 25,
      });
      rows = result.rows;
      tradingDate = result.tradingDate;
      totalCount = result.total;
    } catch {
      // Degrades gracefully
    }
  }

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Stock Screener', path: '/screener' },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
  const itemListSchema = generateItemListSchema({
    name: 'EquityWise Stock Screener',
    description: 'Preset and custom technical scans for National Stock Exchange (NSE) equities.',
    url: `${SITE_URL}/screener`,
    items: SCREENER_PRESETS.map((p) => ({
      name: p.name,
      url: `/screener/${p.slug}`,
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
              <span className="font-medium text-foreground">Stock Screener</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Technical Screener Engine
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              NSE Stock Screener
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Scan across all National Stock Exchange (NSE) equities using precomputed indicators.
              Every query runs on closed candles with zero lookahead bias.
            </p>

            {/* Curated Preset Buttons */}
            <div className="mt-6 flex flex-wrap gap-2">
              {SCREENER_PRESETS.map((preset) => (
                <Button
                  key={preset.slug}
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <Link href={`/screener/${preset.slug}`}>
                    <BarChart3Icon className="size-3.5 text-muted-foreground" />
                    {preset.name}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                High Volume Movers & Activity
              </h2>
              <p className="text-xs text-muted-foreground">
                Equities showing unusual relative volume versus their 20-session average.
                {tradingDate && ` As of session: ${tradingDate}`}
              </p>
            </div>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                Showing top {rows.length} of {totalCount} matching
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/80 bg-surface/30">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-3 font-medium">Stock</th>
                  <th className="p-3 font-medium">Close (LTP)</th>
                  <th className="p-3 font-medium">Change</th>
                  <th className="p-3 font-medium">Relative Vol</th>
                  <th className="p-3 font-medium">RSI (14)</th>
                  <th className="p-3 font-medium">200 EMA</th>
                  <th className="p-3 font-medium">52W High</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-mono">
                {rows.map((row) => {
                  const isPositive = (row.changePercent ?? 0) >= 0;
                  return (
                    <tr key={row.symbol} className="transition-colors hover:bg-surface/70">
                      <td className="p-3 font-sans">
                        <Link
                          href={`/stocks/${row.symbol.toLowerCase()}`}
                          className="font-medium text-foreground hover:text-primary underline-offset-4 hover:underline"
                        >
                          {row.symbol}
                        </Link>
                        <span className="block text-3xs text-muted-foreground">{row.name}</span>
                      </td>
                      <td className="p-3 text-foreground font-semibold">
                        {row.close > 0 ? formatPaise(row.close) : '—'}
                      </td>
                      <td className="p-3">
                        {row.changePercent != null ? (
                          <span
                            className={`inline-flex items-center gap-0.5 ${isPositive ? 'text-bullish' : 'text-bearish'}`}
                          >
                            {isPositive ? '+' : ''}
                            {row.changePercent.toFixed(2)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 text-foreground">
                        {row.relativeVolume != null ? `${row.relativeVolume.toFixed(2)}x` : '—'}
                      </td>
                      <td className="p-3 text-foreground">
                        {row.rsi14 != null ? row.rsi14.toFixed(1) : '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.ema200 ? formatPaise(row.ema200) : '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.high52w ? formatPaise(row.high52w) : '—'}
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                      No screener results available. Check individual presets above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Screener Architecture & Guidelines Section */}
          <div className="mt-12 rounded-xl border border-border/80 bg-surface/20 p-6">
            <h3 className="text-base font-semibold text-foreground">
              How EquityWise Technical Screens Work
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3 text-xs text-muted-foreground leading-relaxed">
              <div>
                <strong className="block font-medium text-foreground">Closed Candle Rule</strong>
                Screens operate strictly on closed daily trading sessions. Forming intraday candles
                never influence end-of-day indicator rankings.
              </div>
              <div>
                <strong className="block font-medium text-foreground">
                  Wilder's Smoothing RSI
                </strong>
                Our 14-period RSI implements standard Wilder's exponential smoothing rather than
                simple moving average approximations.
              </div>
              <div>
                <strong className="block font-medium text-foreground">
                  Corporate Action Safety
                </strong>
                Price boundaries (e.g. 52-week high comparisons) take stock splits and bonuses into
                account, preventing fake breakdown alerts.
              </div>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
