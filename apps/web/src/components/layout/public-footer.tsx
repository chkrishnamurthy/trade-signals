import Link from 'next/link';
import { SCREENER_PRESETS } from '@/app/sitemap';
import { Brand } from '@/components/layout/brand';

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface/50 text-muted-foreground">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand & Mission */}
          <div className="space-y-4 md:col-span-2">
            <Brand showWordmark={true} />
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              EquityWise provides high-precision technical tracking, market screening, and indicator
              analysis for National Stock Exchange (NSE) equities. Decision support, not execution.
            </p>
            <div className="text-xs text-subtle-foreground">
              Data synchronized daily at market close (15:30 IST).
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Markets & Research
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/stocks" className="transition-colors hover:text-foreground">
                  All NSE Stocks
                </Link>
              </li>
              <li>
                <Link href="/screener" className="transition-colors hover:text-foreground">
                  Stock Screener
                </Link>
              </li>
              <li>
                <Link href="/sectors" className="transition-colors hover:text-foreground">
                  Market Sectors
                </Link>
              </li>
              <li>
                <Link href="/watchlists" className="transition-colors hover:text-foreground">
                  Personal Watchlists
                </Link>
              </li>
            </ul>
          </div>

          {/* Screener Presets */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Popular Screeners
            </h4>
            <ul className="space-y-2 text-xs">
              {SCREENER_PRESETS.slice(0, 5).map((preset) => (
                <li key={preset.slug}>
                  <Link
                    href={`/screener/${preset.slug}`}
                    className="transition-colors hover:text-foreground"
                  >
                    {preset.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Trust, Methodology & Legal */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Trust & Legal
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/about" className="transition-colors hover:text-foreground">
                  About EquityWise
                </Link>
              </li>
              <li>
                <Link href="/methodology" className="transition-colors hover:text-foreground">
                  Indicator Methodology
                </Link>
              </li>
              <li>
                <Link href="/data-sources" className="transition-colors hover:text-foreground">
                  Market Data Sources
                </Link>
              </li>
              <li>
                <Link href="/disclaimer" className="transition-colors hover:text-foreground">
                  SEBI Regulatory Disclaimer
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition-colors hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition-colors hover:text-foreground">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition-colors hover:text-foreground">
                  Contact & Support
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Regulatory SEBI Disclaimer */}
        <div className="mt-10 border-t border-border/80 pt-6">
          <p className="text-2xs leading-normal text-muted-foreground/80">
            <strong className="font-semibold text-foreground/90">Regulatory Disclaimer:</strong>{' '}
            EquityWise is a technical data screening and analytical decision-support tool. It is not
            an investment adviser, portfolio manager, or research analyst as defined by SEBI.
            EquityWise does not offer execution, brokerage, or order placement services. Content and
            calculated indicators provided on this platform are for informational and educational
            purposes only and must not be construed as investment, legal, or financial advice. All
            investments in equity securities are subject to market risks. Read all related scheme
            and company documents carefully before investing.
          </p>
          <div className="mt-4 flex flex-col items-center justify-between gap-2 sm:flex-row text-3xs text-subtle-foreground">
            <div>
              &copy; {currentYear} EquityWise. All rights reserved. Built for Indian equity markets.
            </div>
            <div>Prices in integer paise. UTC timestamps converted to IST at presentation.</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
