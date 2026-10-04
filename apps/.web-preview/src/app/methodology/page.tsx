import { BinaryIcon, CalculatorIcon, ChevronRightIcon, DatabaseIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { generateBreadcrumbSchema, SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';

export const metadata: Metadata = {
  title: 'Calculation Methodology & Technical Indicator Math | EquityWise',
  description:
    'Full transparency into EquityWise technical indicator calculations: Wilder’s 14-period RSI, Exponential Moving Averages (EMA), MACD, ATR, and closed-candle invariants.',
  alternates: {
    canonical: '/methodology',
  },
  openGraph: {
    title: 'Calculation Methodology & Technical Indicator Math — EquityWise',
    description:
      'Mathematical definitions of RSI, EMA, MACD, ATR, and corporate action adjustments on EquityWise.',
    url: `${SITE_URL}/methodology`,
  },
};

export default async function MethodologyPage() {
  const user = await getSessionUser();

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Methodology', path: '/methodology' },
  ];
  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <JsonLd schema={breadcrumbSchema} />
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
              <span className="font-medium text-foreground">Methodology</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-12">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Computational Transparency
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Indicator Calculation Methodology
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              We publish our complete mathematical specifications. Zero black boxes, hand-written
              pure calculations, and fully reproducible numbers.
            </p>
          </div>
        </header>

        <article className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8 space-y-12 text-sm leading-relaxed text-muted-foreground">
          {/* Section 1: The Pure Core Rule */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BinaryIcon className="size-5 text-primary" />
              1. Deterministic Pure Functions
            </h2>
            <p>
              Every indicator in our calculation engine lives inside a dedicated pure module.
              Functions accept an immutable series of input bars and parameter configurations and
              return calculated values. They contain:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>No database queries or side effects</li>
              <li>No network calls</li>
              <li>
                No non-deterministic operations (e.g. <code>Date.now()</code>)
              </li>
              <li>No hidden lookahead parameters</li>
            </ul>
            <p>
              This guarantees that the indicators evaluated in historic backtests are mathematically
              identical to those computed at market close.
            </p>
          </section>

          {/* Section 2: RSI 14 (Wilder's Smoothing) */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <CalculatorIcon className="size-5 text-primary" />
              2. Relative Strength Index (RSI 14)
            </h2>
            <p>
              Our 14-period RSI strictly adheres to J. Welles Wilder Jr.'s original smoothing
              methodology rather than the simplified moving average approximations seen in some
              charting libraries.
            </p>
            <div className="rounded-lg border border-border/80 bg-surface/40 p-4 font-mono text-xs text-foreground space-y-2">
              <p>Change = Close[t] - Close[t-1]</p>
              <p>Gain = max(Change, 0), Loss = max(-Change, 0)</p>
              <p>AvgGain[t] = (AvgGain[t-1] * 13 + Gain[t]) / 14</p>
              <p>AvgLoss[t] = (AvgLoss[t-1] * 13 + Loss[t]) / 14</p>
              <p>RS = AvgGain / AvgLoss</p>
              <p>RSI = 100 - (100 / (1 + RS))</p>
            </div>
            <p className="text-xs">
              <strong>Warm-up Period:</strong> Requires at least 15 bars for an initial seed value,
              and stabilization occurs asymptotically after 100+ sessions.
            </p>
          </section>

          {/* Section 3: Exponential Moving Averages (EMA 20, 50, 200) */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <CalculatorIcon className="size-5 text-primary" />
              3. Exponential Moving Averages (EMA)
            </h2>
            <p>
              We track 20, 50, and 200-session EMAs. The weighting multiplier (α) applied to the
              closing price is:
            </p>
            <div className="rounded-lg border border-border/80 bg-surface/40 p-4 font-mono text-xs text-foreground space-y-1">
              <p>α = 2 / (Period + 1)</p>
              <p>EMA[t] = Close[t] * α + EMA[t-1] * (1 - α)</p>
            </div>
            <p className="text-xs">
              Seed value is initialized via a Simple Moving Average (SMA) over the initial window of
              length <code>Period</code>.
            </p>
          </section>

          {/* Section 4: MACD */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <CalculatorIcon className="size-5 text-primary" />
              4. Moving Average Convergence Divergence (MACD)
            </h2>
            <p>Standard 12/26/9 configuration:</p>
            <div className="rounded-lg border border-border/80 bg-surface/40 p-4 font-mono text-xs text-foreground space-y-1">
              <p>MACD Line = EMA(12) - EMA(26)</p>
              <p>Signal Line = EMA(9, MACD Line)</p>
              <p>Histogram = MACD Line - Signal Line</p>
            </div>
          </section>

          {/* Section 5: Corporate Action Price Adjustments */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <DatabaseIcon className="size-5 text-primary" />
              5. Corporate Action Invariant & Read-Time Adjustments
            </h2>
            <p>
              Raw price history stored in the database is never mutated (an append-only database
              trigger enforces this rule). When a stock undergoes a corporate action:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                A row is recorded in <code>corporate_actions</code> with the <code>exDate</code> and
                exact numeric ratio (e.g. a 1:5 split carries <code>ratio = 0.2</code>).
              </li>
              <li>
                Every candle prior to <code>exDate</code> is multiplied by the cumulative adjustment
                ratio on read.
              </li>
              <li>
                Volume scales inversely (divided by ratio) to preserve true liquidity equivalence.
              </li>
              <li>Adjusted prices are rounded back to the nearest integer paise (never float).</li>
            </ul>
          </section>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
