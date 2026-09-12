import { CheckCircle2Icon, ChevronRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { generateBreadcrumbSchema, SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';

export const metadata: Metadata = {
  title: 'About EquityWise — Algorithmic Precision for NSE Equities',
  description:
    'Learn about EquityWise, a multi-user technical tracking, screening, and equity analysis platform built exclusively for Indian stock markets (NSE).',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About EquityWise — Algorithmic Precision for NSE Equities',
    description:
      'Learn about EquityWise, our engineering discipline, and decision-support mission for Indian equities.',
    url: `${SITE_URL}/about`,
  },
};

export default async function AboutPage() {
  const user = await getSessionUser();

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'About EquityWise', path: '/about' },
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
              <span className="font-medium text-foreground">About</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-12">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Our Mission & Philosophy
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              About EquityWise
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Empowering Indian market participants with uncompromising technical accuracy, pure
              calculations, and institutional-grade decision support.
            </p>
          </div>
        </header>

        <article className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8 space-y-12 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">What is EquityWise?</h2>
            <p>
              EquityWise is a specialized platform designed specifically for researching, tracking,
              and screening equities listed on the{' '}
              <strong>National Stock Exchange of India (NSE)</strong>. Unlike conventional retail
              terminals cluttered with unverified tips or gamified trade buttons, EquityWise
              functions strictly as an analytical decision-support system.
            </p>
            <p>The platform answers three questions with total algorithmic objectivity:</p>
            <ol className="list-decimal pl-5 space-y-2 text-foreground font-medium">
              <li>What is happening across benchmark indices and broad market sectors?</li>
              <li>
                Which equities deserve analytical attention right now based on verifiable technical
                setups?
              </li>
              <li>
                Why does a particular stock deserve attention (with transparent factor breakdowns)?
              </li>
            </ol>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">What EquityWise is Not</h2>
            <p>Clarity of boundaries is our primary product invariant:</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle2Icon className="size-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Not a Broker:</strong> EquityWise never places, modifies, routes, or
                  handles customer orders. Order execution is performed independently by users on
                  their own chosen brokerage terminals.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2Icon className="size-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Not a Tip Sheet or Advisory:</strong> We do not offer buy/sell
                  recommendations, guaranteed target returns, or portfolio management services.
                  Directional badges (Bullish/Bearish) describe technical price structures—they are
                  never trade instructions.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2Icon className="size-4 text-primary shrink-0 mt-0.5" />
                <span>
                  <strong>Not a Black Box:</strong> We never display a confidence score or trend
                  reading that cannot be fully audited and mathematically explained by underlying
                  market data.
                </span>
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">Our Core Architectural Principles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-lg border border-border/80 bg-surface/40 p-5">
                <h3 className="font-semibold text-foreground">1. Integer Paise Everywhere</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Floating-point arithmetic introduces silent rounding distortions. In EquityWise,
                  ₹1,245.50 is always stored and calculated as 124550 integer paise.
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-surface/40 p-5">
                <h3 className="font-semibold text-foreground">2. Closed Candles Only</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  The forming candle is constantly in flux. Signals and indicator scans are
                  calculated exclusively on closed candles to eliminate lookahead bias.
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-surface/40 p-5">
                <h3 className="font-semibold text-foreground">3. Read-Time Corporate Actions</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  We never mutate historical price bars. Splits, bonuses, and consolidations are
                  stored as exact adjustment factors applied dynamically on read.
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-surface/40 p-5">
                <h3 className="font-semibold text-foreground">4. Strict UTC Timestamps</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  All database timestamps use TIMESTAMPTZ in UTC, converting to Indian Standard Time
                  (IST) only at the presentation boundary.
                </p>
              </div>
            </div>
          </section>

          <section className="border-t border-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Ready to explore Indian equities?</h3>
              <p className="text-xs text-muted-foreground">
                Access live NSE screener presets and technical analysis.
              </p>
            </div>
            <Button asChild variant="default">
              <Link href="/screener">Launch Stock Screener</Link>
            </Button>
          </section>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
