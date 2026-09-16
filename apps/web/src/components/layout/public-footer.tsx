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
      ['Signals', '/signals'],
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
            Everything here is technical decision-support and educational information — not
            investment advice, and not a recommendation to buy or sell. Markets carry risk; do your
            own research.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand & mission */}
          <div className="col-span-2 space-y-4">
            <Brand href="/" showWordmark={true} />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Clear technical reads on NSE equities — watchlists, signals, corporate filings and
              money-flow, recomputed at every market close with zero lookahead bias.
            </p>
            <div className="flex items-center gap-2 text-xs text-subtle-foreground">
              <span className="size-1.5 rounded-full bg-bullish" aria-hidden />
              Data synced daily at market close · 15:30 IST
            </div>
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
            EquityWise is a technical data screening and analytical decision-support tool. It is not
            an investment adviser, portfolio manager, or research analyst as defined by SEBI.
            EquityWise does not offer execution, brokerage, or order placement services. Content and
            calculated indicators provided on this platform are for informational and educational
            purposes only and must not be construed as investment, legal, or financial advice. All
            investments in equity securities are subject to market risks. Read all related scheme
            and company documents carefully before investing.
          </p>
          <div className="mt-4 flex flex-col items-center justify-between gap-2 text-3xs text-subtle-foreground sm:flex-row">
            <div>&copy; {currentYear} EquityWise. Built for Indian equity markets. 🇮🇳</div>
            <div>Prices in integer paise. UTC timestamps converted to IST at presentation.</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
