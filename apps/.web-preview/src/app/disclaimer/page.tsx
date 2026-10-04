import { AlertOctagonIcon, ChevronRightIcon, ScaleIcon, ShieldAlertIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { generateBreadcrumbSchema, SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';

export const metadata: Metadata = {
  title: 'SEBI Regulatory Disclaimer & Risk Warning | EquityWise',
  description:
    'Official SEBI non-advisory disclaimer, terms of analytical usage, and equity market risk disclosure for EquityWise.',
  alternates: {
    canonical: '/disclaimer',
  },
  openGraph: {
    title: 'SEBI Regulatory Disclaimer & Risk Warning — EquityWise',
    description:
      'SEBI regulatory disclosures, decision-support nature, and risk warning for EquityWise users.',
    url: `${SITE_URL}/disclaimer`,
  },
};

export default async function DisclaimerPage() {
  const user = await getSessionUser();

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Disclaimer', path: '/disclaimer' },
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
              <span className="font-medium text-foreground">Disclaimer</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-12">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Regulatory Compliance
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              SEBI Disclaimer & Risk Disclosure
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Important regulatory notices regarding the educational and decision-support nature of
              EquityWise.
            </p>
          </div>
        </header>

        <article className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8 space-y-10 text-sm leading-relaxed text-muted-foreground">
          {/* SEBI Compliance */}
          <section className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 space-y-3">
            <div className="flex items-center gap-2 text-destructive font-semibold text-base">
              <AlertOctagonIcon className="size-5" />
              Not SEBI Registered — Non-Advisory Notice
            </div>
            <p className="text-foreground/90 font-medium">
              EquityWise (EquityWise.io) is an independent financial technology software platform.
              EquityWise is NOT registered with the Securities and Exchange Board of India (SEBI) as
              a Research Analyst (RA), Investment Adviser (IA), Portfolio Manager (PMS), or Stock
              Broker.
            </p>
            <p className="text-xs text-muted-foreground">
              Nothing published on this website, in our screeners, on stock analysis pages, or
              within automated technical indicators constitutes financial advice, investment advice,
              trading tips, or a recommendation to buy, sell, or hold any security.
            </p>
          </section>

          {/* Decision Support Not Execution */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ScaleIcon className="size-5 text-primary" />
              Decision Support, Not Execution
            </h2>
            <p>
              EquityWise provides mathematical, algorithmic, and statistical analysis of historical
              and end-of-day market data. Directional indicators (such as "Bullish", "Bearish",
              "Breakout", or "RSI Oversold") describe price structure and mathematical momentum
              exclusively. They are not instructions to trade.
            </p>
            <p>
              EquityWise does not maintain order books, accept funds, execute orders, or integrate
              trading terminals. All investment and trading decisions must be executed independently
              by you through your own registered broker at your sole discretion.
            </p>
          </section>

          {/* Market Risk Warning */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShieldAlertIcon className="size-5 text-primary" />
              Market Risk Warning
            </h2>
            <p>
              Investments in the securities market are subject to market risks. Stock prices can
              fluctuate rapidly based on macroeconomic conditions, corporate developments, and
              overall market sentiment. Historical performance, backtested results, and statistical
              chart patterns are no guarantee of future returns.
            </p>
            <p>
              You are strongly advised to conduct your own independent research and consult a
              certified, SEBI-registered financial adviser before making any investment decisions.
            </p>
          </section>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
