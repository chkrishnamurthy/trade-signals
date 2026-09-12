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
  title: 'Privacy Policy | EquityWise',
  description:
    'Privacy policy detailing how EquityWise protects, stores, and handles your account data.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Privacy Policy — EquityWise',
    description:
      'Privacy policy detailing data storage, account security, and user rights on EquityWise.',
    url: `${SITE_URL}/privacy`,
  },
};

export default async function PrivacyPage() {
  const user = await getSessionUser();

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Privacy Policy', path: '/privacy' },
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
              <span className="font-medium text-foreground">Privacy Policy</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-10">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Data Protection
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Privacy Policy
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">Last updated: September 2026</p>
          </div>
        </header>

        <article className="mx-auto max-w-4xl px-4 pt-10 sm:px-6 lg:px-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              1. Data Minimization Commitment
            </h2>
            <p>
              EquityWise is built on strict data minimization principles. We collect and store only
              the data strictly necessary to provide your analytical account services: your verified
              email address, a cryptographic hash of your password (via Argon2id), authenticated
              session tokens, and your customized watchlist preferences.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">2. Where Your Data Lives</h2>
            <p>
              Your personal account records live exclusively on encrypted, self-hosted
              infrastructure. We never sell, lease, monetize, or share your personal information
              with data brokers, ad networks, or behavioral trackers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              3. Third-Party Service Processors
            </h2>
            <p>
              We engage only minimal, vetted technical subprocessors for operational necessities:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Transactional Email Delivery:</strong> Handled through secure API delivery
                (e.g. Resend) solely to dispatch authentication verification links and password
                resets.
              </li>
              <li>
                <strong>Market Data Feeds:</strong> Handled via secure server-to-server market data
                APIs without exposing user identity.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">4. Cookies & Client Storage</h2>
            <p>
              We do not utilize third-party advertising cookies or cross-site tracking pixels.
              Cookies are restricted to essential operational tokens: secure HTTP-only session
              cookies and local storage tokens for visual preferences (such as dark/light UI theme
              and navigation rail state).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              5. Your Data Rights & Deletion
            </h2>
            <p>
              You maintain the absolute right to access, export, or permanently delete your account,
              saved watchlists, and personal data at any time. Permanent deletion requests can be
              initiated directly within your account profile settings or by emailing
              compliance@equitywise.io.
            </p>
          </section>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
