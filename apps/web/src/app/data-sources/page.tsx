import { ChevronRightIcon, ClockIcon, RadioIcon, ShieldCheckIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { generateBreadcrumbSchema, SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';
import { describeDataSources } from '@/server/provider';

export const metadata: Metadata = {
  title: 'Market Data Sources & Update Frequency | EquityWise',
  description:
    'Transparency on EquityWise market data feeds: National Stock Exchange (NSE) quotes, licensed data provider integrations (Fyers API, Dhan API), and daily EOD ingestion passes.',
  alternates: {
    canonical: '/data-sources',
  },
  openGraph: {
    title: 'Market Data Sources & Update Frequency — EquityWise',
    description:
      'Overview of NSE data feeds, provider boundaries, and data freshness policies on EquityWise.',
    url: `${SITE_URL}/data-sources`,
  },
};

/** Plain words for each question the app asks a market-data source. */
const ROUTE_LABELS: Record<string, string> = {
  bars: 'Daily & weekly history',
  intradayBars: 'Intraday history (1m–1h)',
  quotes: 'Snapshot quotes',
  instruments: 'Instrument master',
  status: 'Market open / closed',
  stream: 'Live tick socket',
};

export default async function DataSourcesPage() {
  const user = await getSessionUser();
  // Which provider answers what. A misconfigured selection is an operator
  // problem surfaced in the logs, not a reason for a public page to fail.
  let sources: ReturnType<typeof describeDataSources> | null = null;
  try {
    sources = describeDataSources();
  } catch {
    sources = null;
  }

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Data Sources', path: '/data-sources' },
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
              <span className="font-medium text-foreground">Data Sources</span>
            </nav>
          </div>
        </div>

        <header className="border-b border-border/50 bg-surface/20 py-12">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <Badge variant="outline" className="mb-3 text-2xs uppercase">
              Provenance & Freshness
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Market Data Sources & Freshness
            </h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Transparency regarding where our data originates, how it is ingested, and the exact
              intervals at which it updates.
            </p>
          </div>
        </header>

        <article className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:px-8 space-y-12 text-sm leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <RadioIcon className="size-5 text-primary" />
              1. Market Data Provider & Exchange Coverage
            </h2>
            <p>
              EquityWise tracks equities and indices listed exclusively on the{' '}
              <strong>National Stock Exchange of India (NSE)</strong>. Market data feeds, historical
              OHLCV bars, and quotes are consumed via official API integrations with licensed
              SEBI-registered broker data infrastructures (Fyers API v3 and Dhan API v2).
            </p>
            <p>
              <strong>Broker-Independent Architecture:</strong> While the brokers supply raw market
              feeds, EquityWise is completely broker-independent. Our application logic interacts
              only with a standardized, normalized <code>MarketDataProvider</code> abstraction. No
              proprietary vendor fields or execution APIs enter the core analytical domain. Each
              question the app asks is routed to the source best placed to answer it, with the other
              as fallback.
            </p>
            {sources !== null ? (
              <div className="overflow-x-auto rounded-lg border border-border/80 bg-surface/40">
                <table className="w-full text-xs">
                  <caption className="px-4 py-2 text-left font-semibold text-foreground">
                    Which source answers what{' '}
                    <span className="font-normal text-muted-foreground">
                      (active: {sources.active})
                    </span>
                  </caption>
                  <tbody>
                    {sources.routes.map((entry) => (
                      <tr key={entry.route} className="border-t border-border/60">
                        <th
                          scope="row"
                          className="px-4 py-1.5 text-left font-medium text-foreground"
                        >
                          {ROUTE_LABELS[entry.route] ?? entry.route}
                        </th>
                        <td className="px-4 py-1.5 text-muted-foreground">{entry.provider}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ClockIcon className="size-5 text-primary" />
              2. Update Cycles & Ingestion Frequency
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-lg border border-border/80 bg-surface/40 p-4">
                <h3 className="font-semibold text-foreground">End-of-Day (EOD) Pass</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Runs automatically after the close of every NSE session (15:30 IST). Daily candles
                  and indicators (RSI, EMAs, 52-week extremes) are computed and committed once the
                  exchange publishes final closing numbers.
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-surface/40 p-4">
                <h3 className="font-semibold text-foreground">Live Market Quotes</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  During live market hours (09:15 to 15:30 IST, Monday through Friday), prices and
                  intraday percentages are polled in batches with dynamic refresh intervals based on
                  market open/closed status.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheckIcon className="size-5 text-primary" />
              3. Data Integrity & Ingestion Bookkeeping
            </h2>
            <p>
              Every ingestion run records audit metadata in an internal <code>ingestion_runs</code>{' '}
              table:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Exact IST trading date covered</li>
              <li>Number of instruments requested and successfully ingested</li>
              <li>Row counts and explicit failed symbols array for targeted retries</li>
              <li>
                Automatic error state trapping to prevent incomplete sessions from computing false
                indicator values
              </li>
            </ul>
          </section>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
