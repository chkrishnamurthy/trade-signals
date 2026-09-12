import { type ScreenerFilter, type ScreenerRow, type ScreenerSort, screen } from '@equitywise/db';
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

export const revalidate = 300; // 5-minute ISR

interface PresetConfig {
  readonly title: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly explanation: string;
  readonly filters: readonly ScreenerFilter[];
  readonly sort: ScreenerSort;
}

const PRESET_MAP: Record<string, PresetConfig> = {
  '52-week-high': {
    title: '52-Week High Stocks NSE',
    metaTitle: '52-Week High Stocks NSE — Breakouts & New Highs | EquityWise',
    metaDescription:
      'Discover National Stock Exchange (NSE) equities trading near their 52-week highs. Screen for bullish breakout setups and momentum leaders.',
    explanation:
      'Stocks trading within 3% of their 52-week price ceiling often represent strong institutional sponsorship and secular momentum. Traders monitor these levels for clean price discovery and breakout continuation.',
    filters: [{ kind: 'near_52w_high', withinPercent: 3 }],
    sort: 'relative_volume_desc',
  },
  '52-week-low': {
    title: '52-Week Low Stocks NSE',
    metaTitle: '52-Week Low Stocks NSE — 52W Low Scanner | EquityWise',
    metaDescription:
      'Scan NSE equities trading near their 52-week lows. Analyse oversold conditions, value opportunities, and potential mean-reversion candidates.',
    explanation:
      'Stocks trading within 3% of their 52-week low are experiencing sustained selling pressure. Technical analysts review these for capitulation volume and potential trend reversal patterns.',
    filters: [{ kind: 'near_52w_low', withinPercent: 3 }],
    sort: 'change_asc',
  },
  'rsi-oversold': {
    title: 'RSI Oversold Stocks (RSI < 30) NSE',
    metaTitle: 'RSI Oversold Stocks (RSI < 30) on NSE | EquityWise',
    metaDescription:
      'Find Indian stocks with 14-period RSI below 30. Screen for oversold equities and technical rebound opportunities on the National Stock Exchange.',
    explanation:
      'A 14-period RSI reading below 30 indicates that recent downward price changes have heavily outpaced upward movements. Such conditions frequently precede mean-reverting snapback bounces.',
    filters: [{ kind: 'rsi_between', min: 0, max: 30 }],
    sort: 'rsi_asc',
  },
  'rsi-overbought': {
    title: 'RSI Overbought Stocks (RSI > 70) NSE',
    metaTitle: 'RSI Overbought Stocks (RSI > 70) on NSE | EquityWise',
    metaDescription:
      'Screen NSE stocks with 14-period RSI above 70 indicating powerful bullish momentum or potential exhaustion zones.',
    explanation:
      'An RSI above 70 reflects dominant buyer strength. In strong uptrends, stocks can remain overbought for extended periods, signaling ongoing trend acceleration rather than immediate reversal.',
    filters: [{ kind: 'rsi_between', min: 70, max: 100 }],
    sort: 'rsi_desc',
  },
  'golden-cross': {
    title: 'Bullish EMA Stack (Golden Cross) Stocks NSE',
    metaTitle: 'Golden Cross & Bullish EMA Stack Stocks on NSE | EquityWise',
    metaDescription:
      'Scan NSE stocks in a full bullish moving average stack: Price > 20 EMA > 50 EMA > 200 EMA. Institutional trend alignment screener.',
    explanation:
      'A stacked bullish alignment where the price trades above the 20 EMA, which is above the 50 EMA, which in turn sits above the 200 EMA, represents the textbook institutional definition of a healthy uptrend.',
    filters: [{ kind: 'ema_stacked_bullish' }],
    sort: 'change_desc',
  },
  'volume-breakout': {
    title: 'High Volume Breakout Stocks NSE',
    metaTitle: 'High Volume Breakout Stocks on NSE | EquityWise',
    metaDescription:
      'Discover Indian equities experiencing unusual volume over 2x their 20-session average on the National Stock Exchange.',
    explanation:
      'Unusual relative volume (volume > 2.0x 20-day average) indicates active institutional participation. Volume anomalies paired with price direction are primary catalysts for multi-session moves.',
    filters: [{ kind: 'relative_volume_above', value: 2.0 }],
    sort: 'relative_volume_desc',
  },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = PRESET_MAP[slug];

  if (!config) {
    return {
      title: 'Screener Not Found — EquityWise',
      robots: { index: false },
    };
  }

  const canonicalUrl = `${SITE_URL}/screener/${slug}`;

  return {
    title: config.metaTitle,
    description: config.metaDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: config.metaTitle,
      description: config.metaDescription,
      url: canonicalUrl,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: config.metaTitle,
      description: config.metaDescription,
    },
  };
}

export default async function ScreenerPresetPage({ params }: PageProps) {
  const { slug } = await params;
  const config = PRESET_MAP[slug];

  if (!config) {
    notFound();
  }

  const user = await getSessionUser();
  let rows: readonly ScreenerRow[] = [];
  let tradingDate: string | null = null;
  let total = 0;

  if (isDatabaseConfigured()) {
    try {
      const db = getDatabase();
      const result = await screen(db, {
        filters: config.filters,
        sort: config.sort,
        limit: 50,
      });
      rows = result.rows;
      tradingDate = result.tradingDate;
      total = result.total;
    } catch {
      // Degrades gracefully
    }
  }

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Stock Screener', path: '/screener' },
    { name: config.title, path: `/screener/${slug}` },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
  const itemListSchema = generateItemListSchema({
    name: config.title,
    description: config.metaDescription,
    url: `${SITE_URL}/screener/${slug}`,
    items: rows.map((r) => ({
      name: `${r.name} (${r.symbol})`,
      url: `/stocks/${r.symbol.toLowerCase()}`,
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
              <Link href="/screener" className="hover:text-foreground">
                Screener
              </Link>
              <ChevronRightIcon className="size-3.5 text-subtle-foreground" />
              <span className="font-medium text-foreground">{config.title}</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-3 text-2xs uppercase">
                Preset Technical Scan
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {config.title}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {config.explanation}
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {rows.length} {total > 0 ? `of ${total}` : ''} matching equities{' '}
              {tradingDate && `(Session: ${tradingDate})`}
            </span>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/screener">
                <ArrowLeftIcon className="size-3.5 mr-1" />
                All Screeners
              </Link>
            </Button>
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
                      No stocks currently meet this specific filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
