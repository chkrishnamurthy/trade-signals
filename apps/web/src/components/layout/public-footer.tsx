import { ShieldCheckIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Brand } from '@/components/layout/brand';

/** One footer link column. Every href points at a route that exists — a dead
 *  link in the footer reads as neglect on the page that has to earn trust. */
const COLUMNS: ReadonlyArray<{ title: string; links: ReadonlyArray<[string, Route]> }> = [
  {
    title: 'Product',
    links: [
      ['Market brief', '/today'],
      ['My watchlists', '/watchlists'],
      ['Announcements', '/announcements'],
      ['Institutional flow', '/flows'],
    ],
  },
  {
    title: 'Learn',
    links: [
      ['Methodology', '/methodology'],
      ['Data sources', '/data-sources'],
      ['About EquityWise', '/about'],
      ['Contact & support', '/contact'],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['Terms of service', '/terms'],
      ['Privacy policy', '/privacy'],
      ['Regulatory disclaimer', '/disclaimer'],
    ],
  },
];

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface/50 text-muted-foreground">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        {/* The one line that reframes what this product is — given room, not
            buried in the fine print. */}
        <div className="mb-10 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm leading-relaxed text-muted-foreground">
            <strong className="font-semibold text-foreground">
              EquityWise is not a broker and never places orders.
            </strong>{' '}
            It is a research tool that shows market data and technical readings — not investment
            advice, and not a recommendation to buy, sell or hold. Markets carry risk; do your own
            research.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand & mission */}
          <div className="col-span-2 space-y-4">
            <Brand href="/" showWordmark={true} />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Plain-English research on every NSE-listed stock — watchlists, a screener, corporate
              filings and institutional flows, recomputed after every market close.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title} className="space-y-3">
              <h4 className="text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
                {column.title}
              </h4>
              <ul className="space-y-2.5 text-sm">
                {column.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="transition-colors hover:text-primary">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Regulatory SEBI disclaimer — kept in full; it is load-bearing. */}
        <div className="mt-12 border-t border-border/80 pt-6">
          <p className="text-2xs leading-normal text-muted-foreground/80">
            <strong className="font-semibold text-foreground/90">Regulatory disclaimer:</strong>{' '}
            EquityWise is a research tool that shows market data and technical readings about
            NSE-listed securities. It is not a stockbroker, and it is not registered with SEBI as an
            investment adviser, portfolio manager or research analyst. It does not offer execution,
            brokerage or order placement. Content and calculated indicators are for information only
            and must not be construed as investment, legal or financial advice, or as a
            recommendation to buy, sell or hold any security. All investments in equity securities
            are subject to market risks. Read all related scheme and company documents carefully
            before investing.
          </p>
          <div className="mt-4 flex flex-col items-center justify-between gap-2 text-3xs text-subtle-foreground sm:flex-row">
            <div>&copy; {currentYear} EquityWise. Built for Indian equity markets.</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
