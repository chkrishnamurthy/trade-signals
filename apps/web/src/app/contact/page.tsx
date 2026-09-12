import { BugIcon, ChevronRightIcon, MailIcon, ShieldCheckIcon } from 'lucide-react';
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
  title: 'Contact & Support | EquityWise',
  description:
    'Contact the EquityWise team for support, feature requests, bug reports, and grievance redressal.',
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact & Support — EquityWise',
    description: 'Get in touch with the EquityWise team for feedback, questions, and support.',
    url: `${SITE_URL}/contact`,
  },
};

export default async function ContactPage() {
  const user = await getSessionUser();

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Contact', path: '/contact' },
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
              <span className="font-medium text-foreground">Contact</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-12">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Get in Touch
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Contact & Support
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Have questions, feedback, or need technical assistance? We're here to help.
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-border/80 bg-surface/40 p-6 flex flex-col justify-between">
              <div>
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MailIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">General Enquiries</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  For general questions, feedback, partnerships, or press inquiries.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/50 text-xs font-medium text-foreground">
                support@equitywise.io
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-surface/40 p-6 flex flex-col justify-between">
              <div>
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BugIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Bug & Data Reports</h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Spotted an indicator anomaly or discrepancy in an NSE stock record? Let our
                  engineering team know.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/50 text-xs font-medium text-foreground">
                engineering@equitywise.io
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-surface/40 p-6 flex flex-col justify-between">
              <div>
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheckIcon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  Grievance Redressal
                </h3>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  For compliance inquiries, user account questions, or data privacy requests.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/50 text-xs font-medium text-foreground">
                compliance@equitywise.io
              </div>
            </div>
          </div>

          <div className="mt-12 rounded-xl border border-border/80 bg-surface/20 p-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">Start tracking your names</h2>
            <p className="mt-2 text-xs text-muted-foreground max-w-md mx-auto">
              Build a watchlist of NSE equities and follow their technical indicators, returns, and
              signals — updated at every trading close.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild variant="default" size="sm">
                <Link href="/watchlists">Open My Watchlists</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
