import {
  ActivityIcon,
  ArrowRightIcon,
  GaugeIcon,
  LayersIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/server/auth/require-user';
import { getHeadlineIndices } from '@/server/indices';

export const revalidate = 60; // ISR 1 minute

export const metadata: Metadata = {
  title: 'EquityWise — Track & Analyse NSE Stocks with Technical Indicators',
  description:
    'Build watchlists of National Stock Exchange (NSE) equities and follow their technical indicators, returns, and signals — recomputed at every trading close with zero lookahead bias.',
  alternates: {
    canonical: '/',
  },
};

export default async function HomePage() {
  const user = await getSessionUser();
  const headlineIndices = await getHeadlineIndices().catch(() => []);
  const signedIn = user !== null;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader signedIn={signedIn} />

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
                Track the NSE names that matter to you
              </h1>

              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                Build watchlists of Indian equities and follow their technical indicators, period
                returns, and signals side by side — recomputed at every trading close with zero
                lookahead bias.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                {signedIn ? (
                  <Button asChild size="lg" variant="default" className="gap-2">
                    <Link href="/watchlists">
                      <ListChecksIcon className="size-4" />
                      Open Your Watchlists
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild size="lg" variant="default" className="gap-2">
                      <Link href="/signup">
                        <ListChecksIcon className="size-4" />
                        Get Started — It's Free
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="gap-2">
                      <Link href="/login">Sign In</Link>
                    </Button>
                  </>
                )}
              </div>

              {signedIn && (
                <div className="mt-6 inline-block rounded-lg border border-border/80 bg-surface/60 px-4 py-2 text-xs text-muted-foreground">
                  Signed in as <strong className="text-foreground">{user.email}</strong>.
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

        {/* What a watchlist gives you */}
        <section className="border-b border-border/50 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                One watchlist, every technical read
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add a name and each column fills in automatically after the next NSE close — no
                spreadsheets, no manual maths.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="rounded-xl border border-border/80 bg-surface/40 p-6">
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <GaugeIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Indicator Columns</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  RSI, 20/50/200 EMAs, ATR, and 52-week extremes for every name you follow, computed
                  on closed daily bars and hand-verified against reference fixtures.
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-surface/40 p-6">
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <TrendingUpIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Period Returns</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Day, week, month, and year-to-date performance in one glance, so you can rank the
                  names you care about without leaving the list.
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-surface/40 p-6">
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ActivityIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Technical Signals</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Bullish and bearish setups — breakouts, EMA stacks, volume anomalies — each shown
                  with the factor breakdown behind it. Decision support, never an order.
                </p>
              </div>
            </div>

            <div className="mt-10 flex justify-center">
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                <Link href={signedIn ? '/watchlists' : '/signup'}>
                  {signedIn ? 'Go to your watchlists' : 'Create your first watchlist'}
                  <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Platform Integrity & Rigor (E-E-A-T) */}
        <section className="py-16 sm:py-24 bg-surface/30">
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
