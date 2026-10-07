'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { Brand } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { GRIEVANCE_EMAIL, SUPPORT_EMAIL } from '@/lib/legal';
import { HOME_HREF, LANDING_SECTIONS } from '@/lib/navigation';
import { useSession } from '@/lib/use-session';

/**
 * Footer for public pages.
 *
 * Every link opens for the visitor who sees it: signed out, the product column
 * points at the landing page's sections (no product page is public); signed
 * in, at the app itself — `/` sends members to their Market brief, so a link
 * to a landing section would not land where it says.
 *
 * One navigation landmark with headed columns, rather than a landmark per
 * column: four "navigation" regions in a row is noise to a screen reader.
 *
 * The regulatory paragraph is load-bearing: what EquityWise is (a research
 * tool showing data and technical readings) and is not (a broker, an adviser,
 * a research analyst). "Educational" is deliberately absent: SEBI restricts
 * people presenting themselves as educators from using recent price data.
 */

type FooterLink = { readonly label: string; readonly href: Route | `/#${string}` };

const SIGNED_OUT_PRODUCT: readonly FooterLink[] = [
  ...LANDING_SECTIONS.filter((section) => section.id !== 'trust').map(
    (section): FooterLink => ({ label: section.label, href: `/#${section.id}` }),
  ),
  { label: 'Questions', href: '/#faq' },
];

const SIGNED_IN_PRODUCT: readonly FooterLink[] = [
  { label: 'Market brief', href: HOME_HREF },
  { label: 'Watchlists', href: '/watchlists' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'Screener', href: '/screener' },
];

const LEARN: readonly FooterLink[] = [
  { label: 'Methodology', href: '/methodology' },
  { label: 'Data sources', href: '/data-sources' },
  { label: 'About EquityWise', href: '/about' },
];

const LEGAL: readonly FooterLink[] = [
  { label: 'Terms of service', href: '/terms' },
  { label: 'Privacy policy', href: '/privacy' },
  { label: 'Disclaimer', href: '/disclaimer' },
  { label: 'Contact & grievances', href: '/contact' },
];

const LINK =
  'rounded-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';

function FooterColumn({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            {link.href.startsWith('/#') ? (
              <a href={link.href} className={LINK}>
                {link.label}
              </a>
            ) : (
              <Link href={link.href as Route} className={LINK}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublicFooter() {
  const session = useSession();
  const signedIn = session.status === 'signed-in';

  return (
    <footer data-cta-zone className="border-border border-t bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,3fr)]">
          <div className="flex flex-col items-start gap-4">
            <Brand href={signedIn ? HOME_HREF : '/'} showWordmark={true} />
            <p className="m-0 max-w-xs text-muted-foreground text-sm leading-relaxed">
              Plain-English research on NSE-listed stocks. Not a broker; never places orders.
            </p>
            <p className="m-0 text-muted-foreground text-sm">
              <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
                {SUPPORT_EMAIL}
              </a>
            </p>
            {/* Signed-in visitors already have the theme choice in their account
                menu; a second control on the same screen is one too many. */}
            {!signedIn && <ThemeToggle />}
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <FooterColumn
              title="Product"
              links={signedIn ? SIGNED_IN_PRODUCT : SIGNED_OUT_PRODUCT}
            />
            <FooterColumn
              title="Learn"
              links={signedIn ? LEARN : [...LEARN, { label: 'Trust & safety', href: '/#trust' }]}
            />
            <FooterColumn title="Legal" links={LEGAL} />
          </nav>
        </div>

        <div className="mt-12 rounded-xl border border-border bg-surface-sunken p-5 text-muted-foreground text-sm leading-relaxed">
          <p className="m-0">
            <strong className="font-semibold text-foreground">
              EquityWise is a research tool, not investment advice.
            </strong>{' '}
            It shows market data and technical readings about NSE-listed securities. It is not a
            stockbroker, and it is not registered with SEBI as an investment adviser or research
            analyst. Nothing on EquityWise is a recommendation to buy, sell or hold any security.
            Investments in the securities market are subject to market risks; do your own research
            before investing.{' '}
            <Link
              href="/disclaimer"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              Full disclaimer
            </Link>
          </p>
          <p className="m-0 mt-3">
            Exchange data comes from the National Stock Exchange of India (NSE) and, for company
            announcements, BSE.{' '}
            <Link
              href="/data-sources"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              Data sources
            </Link>
            . Grievances:{' '}
            <a
              href={`mailto:${GRIEVANCE_EMAIL}`}
              className="font-semibold text-foreground underline underline-offset-4"
            >
              {GRIEVANCE_EMAIL}
            </a>
            .
          </p>
        </div>

        <p className="m-0 mt-8 text-muted-foreground text-sm">
          &copy; {new Date().getFullYear()} EquityWise
        </p>
      </div>
    </footer>
  );
}
