import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicArticle, PublicList, PublicSection } from '@/components/layout/public-page';
import { SHARE_IMAGE, SITE_URL } from '@/lib/seo/schema';
import { describeDataSources } from '@/server/provider';

const DESCRIPTION =
  'Where EquityWise gets its prices, filings and IPO details, and how fresh each one is.';

export const metadata: Metadata = {
  title: 'Data sources and freshness',
  description: DESCRIPTION,
  alternates: { canonical: '/data-sources' },
  openGraph: {
    title: 'Data sources and freshness — EquityWise',
    description: DESCRIPTION,
    url: `${SITE_URL}/data-sources`,
    images: [SHARE_IMAGE],
  },
};

// The provider routing table is read from the running server's configuration.
export const dynamic = 'force-dynamic';

/** Plain words for each question the app asks a market-data provider. */
const ROUTE_LABELS: Record<string, string> = {
  bars: 'Daily and weekly price history',
  intradayBars: 'Intraday price history',
  quotes: 'Price snapshots during market hours',
  instruments: 'List of tradable instruments',
  status: 'Whether the market is open',
  stream: 'Live price updates',
};

const STRONG = 'font-semibold text-foreground';

export default function DataSourcesPage() {
  // A misconfigured selection is an operator problem surfaced in the logs, not
  // a reason for a public page to fail.
  let sources: ReturnType<typeof describeDataSources> | null = null;
  try {
    sources = describeDataSources();
  } catch {
    sources = null;
  }

  return (
    <PublicArticle
      path="/data-sources"
      crumb="Data sources"
      title="Where the data comes from"
      intro="Every figure on EquityWise starts at an exchange or a company filing. This page lists the sources and how often each is refreshed."
      updated="October 2026"
    >
      <PublicSection title="Prices">
        <PublicList>
          <li>
            <strong className={STRONG}>End-of-day prices</strong> for the screener and stock pages
            come from the National Stock Exchange of India&rsquo;s (NSE) published end-of-day files,
            read after each session closes. They cover NSE mainboard stocks in the EQ, BE and BZ
            series.
          </li>
          <li>
            <strong className={STRONG}>Prices during market hours</strong> (watchlists, the
            portfolio) and price history are read from the market-data services of Indian
            stockbrokers. EquityWise only reads prices from them; it never connects to
            anyone&rsquo;s trading account.
          </li>
        </PublicList>
        {sources !== null && (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="px-4 py-2 text-left font-semibold text-foreground">
                Which market-data service answers what
              </caption>
              <tbody>
                {sources.routes.map((entry) => (
                  <tr key={entry.route} className="border-border border-t">
                    <th scope="row" className="px-4 py-2 text-left font-medium text-foreground">
                      {ROUTE_LABELS[entry.route] ?? entry.route}
                    </th>
                    <td className="px-4 py-2">{entry.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PublicSection>

      <PublicSection title="Filings, flows and corporate actions">
        <PublicList>
          <li>
            <strong className={STRONG}>Company announcements</strong> come from BSE&rsquo;s public
            corporate-filings feed, matched to NSE symbols by ISIN.
          </li>
          <li>
            <strong className={STRONG}>
              Delivery, bulk and block deals, and F&amp;O open interest
            </strong>{' '}
            come from NSE&rsquo;s daily archive files, published after each close.
          </li>
          <li>
            <strong className={STRONG}>FII and DII cash activity</strong> and{' '}
            <strong className={STRONG}>promoter and public shareholding</strong> come from
            NSE&rsquo;s public data.
          </li>
          <li>
            <strong className={STRONG}>Splits, bonuses and dividends</strong> come from NSE&rsquo;s
            corporate-action records. Splits and bonuses are applied to price history as described
            on the{' '}
            <Link
              href="/methodology"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              methodology page
            </Link>
            ; dividends are never applied to prices.
          </li>
          <li>
            <strong className={STRONG}>Large, mid and small-cap labels</strong> come from
            AMFI&rsquo;s half-yearly list.
          </li>
        </PublicList>
      </PublicSection>

      <PublicSection title="IPOs">
        <p className="m-0">
          IPO dates, price bands, lot sizes, issue sizes, registrars, lead managers, offer documents
          and subscription figures come from NSE&rsquo;s public IPO pages and are shown with the
          time each was read. Listing-day prices come from NSE&rsquo;s end-of-day file. Dates marked
          &ldquo;expected&rdquo; are calculated from SEBI&rsquo;s T+3 timetable until the exchange
          publishes them.
        </p>
        <p className="m-0">
          Sections shown &ldquo;from the offer document&rdquo; are read automatically from the Red
          Herring Prospectus the exchange publishes and quoted as the company wrote them, with the
          page they came from; check the document itself. Draft offer documents (DRHPs) are listed
          as filed with SEBI, linked to SEBI&rsquo;s page; a filing is not an announced issue.
        </p>
        <p className="m-0">
          The <strong className={STRONG}>grey-market premium (GMP)</strong> is an unofficial,
          unregulated quote that no exchange or regulator publishes. EquityWise shows it, labelled
          as unofficial, as reported by <strong className={STRONG}>InvestorGain</strong>, and does
          not verify it. It is not a forecast of the listing price.
        </p>
      </PublicSection>

      <PublicSection title="How fresh it is">
        <PublicList>
          <li>
            <strong className={STRONG}>After each close:</strong> the end-of-day pass runs after
            15:30 IST once the exchange has published its files, and recalculates every indicator
            and screener measure. Stock pages say which close they show.
          </li>
          <li>
            <strong className={STRONG}>During market hours</strong> (09:15–15:30 IST on trading
            days): watchlist prices refresh every few seconds to a few minutes, and watchlists show
            when a price was last updated or if it is stale.
          </li>
          <li>
            Each daily run records which stocks it covered and which failed, so an incomplete day is
            retried rather than shown as complete.
          </li>
        </PublicList>
      </PublicSection>
    </PublicArticle>
  );
}
