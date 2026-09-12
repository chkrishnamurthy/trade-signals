import { formatPaise } from '@equitywise/shared';
import {
  ActivityIcon,
  ChevronRightIcon,
  InfoIcon,
  LayersIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  generateStockSchema,
  SITE_URL,
} from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';
import { getStockDetail } from '@/server/stock-detail';

export const revalidate = 300; // 5-minute ISR

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  const stock = await getStockDetail(symbol);

  if (!stock) {
    return {
      title: 'Stock Not Found — EquityWise',
      description: 'The requested stock ticker does not exist on EquityWise.',
      robots: { index: false },
    };
  }

  const priceStr = stock.close > 0 ? formatPaise(stock.close) : '';
  const changeStr =
    stock.changePercent != null
      ? `${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`
      : '';

  const title = `${stock.name} (${stock.symbol}) Share Price ${priceStr}, Technical Analysis & Indicators | EquityWise`;
  const description = `${stock.name} (${stock.symbol}) NSE share price is ${priceStr} (${changeStr}). Track 52-week range, 20/50/200-day EMA, RSI (14), MACD, volume anomalies, and technical signals on EquityWise.`;

  const canonicalUrl = `${SITE_URL}/stocks/${stock.symbol.toLowerCase()}`;

  return {
    title,
    description,
    keywords: [
      `${stock.name} share price`,
      `${stock.symbol} share price today`,
      `${stock.symbol} stock analysis`,
      `${stock.symbol} 52 week high`,
      `${stock.symbol} RSI`,
      `${stock.symbol} moving averages`,
      `${stock.symbol} NSE`,
      `${stock.sector} stocks`,
    ],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'EquityWise',
      type: 'article',
      locale: 'en_IN',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function StockDetailPage({ params }: PageProps) {
  const { symbol } = await params;
  const stock = await getStockDetail(symbol);

  if (!stock) {
    notFound();
  }

  const user = await getSessionUser();
  const sectorSlug = stock.sector
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  // JSON-LD structured data
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Stocks', path: '/stocks' },
    { name: stock.sector, path: `/sectors/${sectorSlug}` },
    { name: stock.name, path: `/stocks/${stock.symbol.toLowerCase()}` },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);
  const stockSchema = generateStockSchema({
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    exchange: stock.exchange,
    isin: stock.isin,
    description: `${stock.name} (${stock.symbol}) is an equity listed on the National Stock Exchange of India (NSE) in the ${stock.sector} sector.`,
  });

  // Factual FAQ generation for FAQPage schema and visible section
  const faqs = [
    {
      question: `What was the latest closing price for ${stock.name} (${stock.symbol})?`,
      answer: `${stock.name} closed at ${stock.close > 0 ? formatPaise(stock.close) : 'N/A'}${stock.changePercent != null ? ` with a daily change of ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%` : ''} on the National Stock Exchange (NSE).`,
    },
    {
      question: `What is the 52-week high and low range for ${stock.symbol}?`,
      answer: `${stock.symbol}'s 52-week high is ${stock.high52w ? formatPaise(stock.high52w) : 'N/A'} and its 52-week low is ${stock.low52w ? formatPaise(stock.low52w) : 'N/A'}.`,
    },
    {
      question: `What is the RSI (Relative Strength Index) of ${stock.symbol}?`,
      answer: `${stock.symbol}'s 14-period RSI stands at ${stock.rsi14 != null ? stock.rsi14.toFixed(1) : 'N/A'}. An RSI below 30 typically signals oversold conditions, while an RSI above 70 indicates overbought territory.`,
    },
    {
      question: `Is ${stock.symbol} trading above its 200-day Exponential Moving Average (EMA)?`,
      answer:
        stock.ema200 != null
          ? `${stock.symbol}'s 200-day EMA is ${formatPaise(stock.ema200)}. The current price is ${stock.close > stock.ema200 ? 'trading ABOVE' : 'trading BELOW'} its 200-day EMA, representing a ${stock.close > stock.ema200 ? 'long-term bullish' : 'long-term bearish'} trend bias.`
          : `Historical candle data is currently warming up to compute the 200-day EMA for ${stock.symbol}.`,
    },
  ];

  const faqSchema = generateFaqSchema(faqs);

  const isPositive = (stock.changePercent ?? 0) >= 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Structured data injection */}
      <JsonLd schema={breadcrumbSchema} />
      <JsonLd schema={stockSchema} />
      <JsonLd schema={faqSchema} />

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
              <Link href="/stocks" className="hover:text-foreground">
                Stocks
              </Link>
              <ChevronRightIcon className="size-3.5 text-subtle-foreground" />
              <Link href={`/sectors/${sectorSlug}`} className="hover:text-foreground">
                {stock.sector}
              </Link>
              <ChevronRightIcon className="size-3.5 text-subtle-foreground" />
              <span className="font-medium text-foreground">{stock.symbol}</span>
            </nav>
          </div>
        </div>

        {/* Hero Stock Header */}
        <header className="border-b border-border/50 bg-linear-to-b from-surface/50 to-background py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-2xs uppercase">
                    {stock.exchange}
                  </Badge>
                  <Link href={`/sectors/${sectorSlug}`}>
                    <Badge variant="secondary" className="text-2xs hover:bg-accent">
                      {stock.sector}
                    </Badge>
                  </Link>
                  {stock.isin && (
                    <span className="text-2xs text-muted-foreground">ISIN: {stock.isin}</span>
                  )}
                </div>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {stock.name} ({stock.symbol})
                </h1>

                <p className="mt-1 text-xs text-muted-foreground">
                  Technical analysis and momentum indicators for {stock.name} on the National Stock
                  Exchange of India.
                </p>
              </div>

              {/* Price Callout */}
              <div className="flex flex-col items-start md:items-end">
                <div className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {stock.close > 0 ? formatPaise(stock.close) : '—'}
                </div>

                {stock.changePercent != null && (
                  <div
                    className={`mt-1 flex items-center gap-1 text-sm font-medium ${
                      isPositive ? 'text-bullish' : 'text-bearish'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUpIcon className="size-4" />
                    ) : (
                      <TrendingDownIcon className="size-4" />
                    )}
                    <span>
                      {isPositive ? '+' : ''}
                      {stock.changePercent.toFixed(2)}%
                    </span>
                    <span className="text-xs text-muted-foreground">vs prev close</span>
                  </div>
                )}

                {stock.tradingDate && (
                  <span className="mt-1 text-2xs text-subtle-foreground">
                    As of session: {stock.tradingDate}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Primary Analysis Column (2 Cols) */}
            <div className="space-y-8 lg:col-span-2">
              {/* Section 1: Technical Overview & Levels */}
              <section
                aria-labelledby="overview-heading"
                className="rounded-xl border border-border/80 bg-surface/30 p-6"
              >
                <h2 id="overview-heading" className="text-lg font-semibold text-foreground">
                  Technical Overview & Price Range
                </h2>

                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                    <span className="text-2xs font-medium text-muted-foreground uppercase">
                      Day High
                    </span>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {stock.high > 0 ? formatPaise(stock.high) : '—'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                    <span className="text-2xs font-medium text-muted-foreground uppercase">
                      Day Low
                    </span>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {stock.low > 0 ? formatPaise(stock.low) : '—'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                    <span className="text-2xs font-medium text-muted-foreground uppercase">
                      52-Week High
                    </span>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {stock.high52w ? formatPaise(stock.high52w) : '—'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                    <span className="text-2xs font-medium text-muted-foreground uppercase">
                      52-Week Low
                    </span>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                      {stock.low52w ? formatPaise(stock.low52w) : '—'}
                    </p>
                  </div>
                </div>

                {/* 52W Range Visualizer */}
                {stock.high52w && stock.low52w && stock.close > 0 && (
                  <div className="mt-6 rounded-lg border border-border/60 bg-background/40 p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>52W Low: {formatPaise(stock.low52w)}</span>
                      <span className="font-medium text-foreground">
                        Current: {formatPaise(stock.close)}
                      </span>
                      <span>52W High: {formatPaise(stock.high52w)}</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              ((stock.close - stock.low52w) / (stock.high52w - stock.low52w)) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* Section 2: Moving Averages & Trend Bias */}
              <section
                aria-labelledby="ma-heading"
                className="rounded-xl border border-border/80 bg-surface/30 p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 id="ma-heading" className="text-lg font-semibold text-foreground">
                      Moving Averages (EMA & SMA)
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Calculated on closed daily sessions with exact corporate action adjustments.
                    </p>
                  </div>
                  <LayersIcon className="size-5 text-muted-foreground" />
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="pb-2 font-medium">Indicator</th>
                        <th className="pb-2 font-medium">Value</th>
                        <th className="pb-2 font-medium">Trend Bias</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 font-mono">
                      {[
                        { name: '20-Day EMA', val: stock.ema20 },
                        { name: '50-Day EMA', val: stock.ema50 },
                        { name: '200-Day EMA', val: stock.ema200 },
                        { name: '20-Day SMA', val: stock.sma20 },
                        { name: '50-Day SMA', val: stock.sma50 },
                      ].map((row) => {
                        const isAbove = row.val != null && stock.close > row.val;
                        return (
                          <tr key={row.name}>
                            <td className="py-2.5 font-sans font-medium text-foreground">
                              {row.name}
                            </td>
                            <td className="py-2.5 text-foreground">
                              {row.val ? formatPaise(row.val) : '—'}
                            </td>
                            <td className="py-2.5 font-sans">
                              {row.val != null ? (
                                <Badge
                                  variant="outline"
                                  size="sm"
                                  className={
                                    isAbove
                                      ? 'border-bullish text-bullish'
                                      : 'border-bearish text-bearish'
                                  }
                                >
                                  {isAbove ? 'Bullish (Above)' : 'Bearish (Below)'}
                                </Badge>
                              ) : (
                                <span className="text-subtle-foreground">Warming up</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Section 3: Momentum & Oscillators */}
              <section
                aria-labelledby="momentum-heading"
                className="rounded-xl border border-border/80 bg-surface/30 p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 id="momentum-heading" className="text-lg font-semibold text-foreground">
                      Momentum & Oscillators
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      14-period RSI (Wilder's smoothing) and MACD histogram readings.
                    </p>
                  </div>
                  <ActivityIcon className="size-5 text-muted-foreground" />
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* RSI Card */}
                  <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                    <span className="text-2xs font-medium text-muted-foreground uppercase">
                      RSI (14)
                    </span>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-bold text-foreground">
                        {stock.rsi14 != null ? stock.rsi14.toFixed(1) : '—'}
                      </span>
                      {stock.rsi14 != null && (
                        <span className="text-xs font-medium text-muted-foreground">
                          {stock.rsi14 > 70 ? (
                            <span className="text-bearish">Overbought</span>
                          ) : stock.rsi14 < 30 ? (
                            <span className="text-bullish">Oversold</span>
                          ) : (
                            <span>Neutral</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* MACD Histogram Card */}
                  <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                    <span className="text-2xs font-medium text-muted-foreground uppercase">
                      MACD Histogram
                    </span>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-bold text-foreground">
                        {stock.macdHistogram != null ? formatPaise(stock.macdHistogram) : '—'}
                      </span>
                      {stock.macdHistogram != null && (
                        <span
                          className={`text-xs font-medium ${stock.macdHistogram >= 0 ? 'text-bullish' : 'text-bearish'}`}
                        >
                          {stock.macdHistogram >= 0 ? 'Positive' : 'Negative'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Relative Volume Card */}
                  <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                    <span className="text-2xs font-medium text-muted-foreground uppercase">
                      Relative Volume
                    </span>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-bold text-foreground">
                        {stock.relativeVolume != null ? `${stock.relativeVolume.toFixed(2)}x` : '—'}
                      </span>
                      {stock.relativeVolume != null && (
                        <span className="text-xs font-medium text-muted-foreground">
                          {stock.relativeVolume > 1.5 ? 'High Volume' : 'Normal'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 4: Corporate Actions & Dividends */}
              {stock.corporateActions.length > 0 && (
                <section
                  aria-labelledby="actions-heading"
                  className="rounded-xl border border-border/80 bg-surface/30 p-6"
                >
                  <h2 id="actions-heading" className="text-lg font-semibold text-foreground">
                    Corporate Actions & Historical Adjustments
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Historical splits, bonuses, and consolidations applied to maintain series
                    integrity.
                  </p>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="pb-2 font-medium">Ex-Date</th>
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium">Adjustment Ratio</th>
                          <th className="pb-2 font-medium">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50 font-mono">
                        {stock.corporateActions.map((ca) => (
                          <tr key={`${ca.exDate}-${ca.kind}-${ca.ratio}`}>
                            <td className="py-2 text-foreground">{ca.exDate}</td>
                            <td className="py-2 font-sans capitalize text-foreground">{ca.kind}</td>
                            <td className="py-2 text-foreground">{ca.ratio}</td>
                            <td className="py-2 font-sans text-muted-foreground">
                              {ca.note ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Section 5: Frequently Asked Questions */}
              <section
                aria-labelledby="faq-heading"
                className="rounded-xl border border-border/80 bg-surface/30 p-6"
              >
                <h2 id="faq-heading" className="text-lg font-semibold text-foreground">
                  Frequently Asked Questions about {stock.symbol}
                </h2>
                <div className="mt-6 space-y-4">
                  {faqs.map((faq) => (
                    <div
                      key={faq.question}
                      className="rounded-lg border border-border/60 bg-background/40 p-4"
                    >
                      <h3 className="text-sm font-semibold text-foreground">{faq.question}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Sidebar Column (1 Col) - Peer Linking & Screener Presets */}
            <aside className="space-y-6">
              {/* Sector Peers Link Graph */}
              {stock.peers.length > 0 && (
                <div className="rounded-xl border border-border/80 bg-surface/30 p-5">
                  <h3 className="text-sm font-semibold text-foreground">
                    Related {stock.sector} Stocks
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Compare technical setups with other companies in the {stock.sector} sector.
                  </p>

                  <ul className="mt-4 divide-y divide-border/50">
                    {stock.peers.map((peer) => (
                      <li key={peer.symbol}>
                        <Link
                          href={`/stocks/${peer.symbol.toLowerCase()}`}
                          className="flex items-center justify-between py-2.5 transition-colors hover:text-primary"
                        >
                          <div>
                            <span className="font-medium text-xs text-foreground">
                              {peer.symbol}
                            </span>
                            <span className="block text-3xs text-muted-foreground">
                              {peer.name}
                            </span>
                          </div>
                          <ChevronRightIcon className="size-3.5 text-subtle-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 border-t border-border/50 pt-3">
                    <Button asChild variant="outline" size="sm" className="w-full text-xs">
                      <Link href={`/sectors/${sectorSlug}`}>All {stock.sector} Stocks &rarr;</Link>
                    </Button>
                  </div>
                </div>
              )}

              {/* Screener CTAs */}
              <div className="rounded-xl border border-border/80 bg-surface/30 p-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Explore More Technical Setups
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scan other NSE stocks exhibiting similar momentum or breakout characteristics.
                </p>

                <div className="mt-4 space-y-2">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                  >
                    <Link href="/screener/52-week-high">52-Week High Breakouts</Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                  >
                    <Link href="/screener/rsi-oversold">RSI Oversold Setups</Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                  >
                    <Link href="/screener/golden-cross">Golden Cross (Bullish EMA Stack)</Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                  >
                    <Link href="/screener/volume-breakout">High Volume Movers</Link>
                  </Button>
                </div>
              </div>

              {/* Data Freshness & Disclaimer Note */}
              <div className="rounded-xl border border-border/60 bg-background/50 p-4 text-2xs text-muted-foreground space-y-2">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <InfoIcon className="size-3.5" />
                  Technical Data Discipline
                </div>
                <p>
                  Prices are stored in integer paise. Indicators are derived strictly from closed
                  candle sessions. Past performance and technical setups do not guarantee future
                  market returns.
                </p>
                <Link
                  href="/methodology"
                  className="inline-block text-foreground underline underline-offset-2"
                >
                  Read our calculation methodology &rarr;
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
