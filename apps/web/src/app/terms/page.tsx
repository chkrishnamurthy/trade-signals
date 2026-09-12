import { ChevronRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { generateBreadcrumbSchema, SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';

export const metadata: Metadata = {
  title: 'Terms of Service | EquityWise',
  description:
    'Terms of Service governing the use of EquityWise technical screening and equity analysis platform.',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'Terms of Service — EquityWise',
    description: 'Terms of Service governing the use of EquityWise.',
    url: `${SITE_URL}/terms`,
  },
};

export default async function TermsPage() {
  const user = await getSessionUser();

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Terms of Service', path: '/terms' },
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
              <span className="font-medium text-foreground">Terms of Service</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-10">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Legal Terms
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Terms of Service
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">Last updated: September 2026</p>
          </div>
        </header>

        <article className="mx-auto max-w-4xl px-4 pt-10 sm:px-6 lg:px-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using EquityWise (accessible at equitywise.io), you acknowledge that
              you have read, understood, and agree to be bound by these Terms of Service. If you do
              not agree to these terms, you must not access or use the platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              2. Analytical Nature & Non-Advisory Scope
            </h2>
            <p>
              EquityWise is an algorithmic technical tracking, analytical decision-support, and
              screening service for National Stock Exchange (NSE) equities. EquityWise is not a
              registered investment adviser, broker, or portfolio manager under SEBI regulations.
              Content, signals, screener rankings, and indicators do not constitute financial
              advice, investment recommendations, or trade orders.
            </p>
            <p>
              You acknowledge that you retain sole responsibility for your investment decisions, and
              you agree to consult a certified financial adviser before acting on any market
              analysis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">3. User Accounts & Security</h2>
            <p>
              When creating an account, you agree to provide accurate email details and maintain the
              confidentiality of your credentials. You are responsible for all activity originating
              from your account sessions. Multi-tenant scraping, automated bot attacks,
              reverse-engineering of private APIs, or unauthorized data extraction are strictly
              prohibited.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              4. Intellectual Property & Data Rights
            </h2>
            <p>
              All software, indicator algorithms, design tokens, visual presentations, and databases
              comprising EquityWise are proprietary. Market data is sourced via authorized feeds
              from licensed providers. Users are granted a personal, revocable, non-exclusive
              license to use the service for personal research and tracking.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">5. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by applicable law, EquityWise, its founders,
              contributors, and service providers shall not be liable for any direct, indirect,
              incidental, punitive, or consequential damages resulting from market losses, system
              outages, data latency, provider errors, or decisions made based on platform content.
            </p>
          </section>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
