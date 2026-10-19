import Link from 'next/link';
import type * as React from 'react';
import { EmptyState } from '@/components/data-display/states';
import { PercentChange } from '@/components/market/numeric';
import { Card } from '@/components/ui/card';
import { signedPercent } from '@/lib/format';
import { shortDate, times } from '@/lib/ipo-format';
import { type IpoScope, sectionHref } from '@/lib/ipo-routes';
import type { IpoListingsPageDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { CompanyCell } from '../ipo-cells';
import { sharePrice } from '../ipo-figures';
import { IpoSectionPage } from '../ipo-section-page';
import { ModuleCard, ModuleTable } from '../module-card';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;

function listingsHref(scope: IpoScope, year: number | null, currentYear: number, page = 1) {
  return sectionHref('listings', scope, {
    year: year === null ? 'all' : year === currentYear ? null : String(year),
    page: page > 1 ? String(page) : null,
  });
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-surface px-3.5 py-3 shadow-subtle">
      <span className="truncate text-muted-foreground text-xs">{label}</span>
      <span className="figure font-medium text-2xl tracking-tight">{value}</span>
      <span className="text-2xs text-muted-foreground">{hint}</span>
    </div>
  );
}

const ratio = (part: number, whole: number) => (whole === 0 ? '—' : `${part} / ${whole}`);

/**
 * How issues listed (`/ipos/listings`): outcomes against the issue price from
 * the exchange's end-of-day prices — counts with their denominators, the
 * middle gain, month by month, and every listing. A record of what happened,
 * never a rating of any issue or a forecast for the next.
 */
export function IpoListingsView({ data }: { data: IpoListingsPageDto }) {
  const currentYear = Number(data.today.slice(0, 4));
  const s = data.stats;
  const yearWord = data.year === null ? 'all years' : String(data.year);
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const mixed = data.board === 'all';
  const yearChoices: (number | null)[] = [...data.years, null];
  return (
    <IpoSectionPage
      section="listings"
      scope={data.board}
      scopeHref={(sc) => listingsHref(sc, data.year, currentYear)}
      feeds={data.feeds}
      rememberLabel={`IPO listings ${yearWord}`}
      description="How each issue listed against its issue price: the listing-day open and the latest close, from the exchange's end-of-day prices. Outcomes recorded, not a forecast."
    >
      <nav aria-label="Year" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1.5">
          {yearChoices.map((y) => {
            const on = y === data.year;
            return (
              <li key={y ?? 'all'}>
                <Link
                  href={listingsHref(data.board, y, currentYear)}
                  aria-current={on ? 'page' : undefined}
                  scroll={false}
                  className={cn(
                    'inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors',
                    on
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-surface hover:bg-accent',
                  )}
                >
                  {y ?? 'All years'}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section
        aria-label={`Listings in ${yearWord}`}
        className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
      >
        <Stat label="Listed" value={s.listed} hint={`issues, ${yearWord}`} />
        <Stat
          label="Opened above issue price"
          value={ratio(s.openedAbove, s.withListingPrice)}
          hint={
            s.withListingPrice === s.listed
              ? 'at the listing-day open'
              : `${s.withListingPrice} of ${s.listed} have listing prices`
          }
        />
        <Stat
          label="Middle listing-day gain"
          value={signedPercent(s.medianListingGain)}
          hint="median, open against issue price"
        />
        <Stat
          label="Above issue price now"
          value={ratio(s.latestAbove, s.withLatestClose)}
          hint={`median ${signedPercent(s.medianSinceIssue)} since issue, at the last close`}
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
        <ModuleCard
          id="ipo-listing-months"
          title="By month"
          note="Listings each month, how many opened above the issue price, and the middle listing-day gain."
        >
          <ModuleTable
            caption="Listings by month"
            rows={data.months}
            rowKey={(m) => m.month}
            empty="No listing in this period."
            columns={[
              { id: 'month', header: 'Month', cell: (m) => monthLabel(m.month) },
              {
                id: 'listed',
                header: 'Listed',
                width: 'w-14',
                align: 'end',
                cell: (m) => <span className="figure">{m.listed}</span>,
              },
              {
                id: 'above',
                header: 'Above',
                width: 'w-20',
                align: 'end',
                cell: (m) => (
                  <span className="figure text-muted-foreground">
                    {ratio(m.openedAbove, m.withListingPrice)}
                  </span>
                ),
              },
              {
                id: 'median',
                header: 'Middle',
                width: 'w-20',
                align: 'end',
                cell: (m) => <PercentChange value={m.medianListingGain} size="sm" />,
              },
            ]}
            mobile={(m) => ({
              title: monthLabel(m.month),
              sub: `${m.listed} listed · ${ratio(m.openedAbove, m.withListingPrice)} opened above`,
              value: <PercentChange value={m.medianListingGain} size="sm" />,
              valueSub: 'middle day 1',
            })}
          />
        </ModuleCard>

        <Card className="overflow-hidden" aria-labelledby="ipo-listings-all">
          <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5 pb-3">
            <h2 id="ipo-listings-all" className="font-semibold text-sm tracking-tight">
              Every listing, newest first
            </h2>
            <span className="text-muted-foreground text-xs">
              {data.total === 0
                ? 'None'
                : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.total, data.page * data.pageSize)} of ${data.total}`}
            </span>
          </header>
          {data.rows.length === 0 ? (
            <EmptyState
              title="No listing in this period"
              description="Choose another year above, or All years."
            />
          ) : (
            <ModuleTable
              caption={`Listings, ${yearWord}`}
              rows={data.rows}
              rowKey={(r) => r.slug}
              empty="No listing."
              columns={[
                {
                  id: 'company',
                  header: 'Company',
                  cell: (r) => <CompanyCell row={r} showBoard={mixed} className="max-w-64" />,
                },
                {
                  id: 'listed',
                  header: 'Listed',
                  width: 'w-28',
                  cell: (r) => (
                    <span className="figure text-xs">
                      {r.listingDate === null ? '—' : shortDate(r.listingDate)}
                    </span>
                  ),
                },
                {
                  id: 'issue',
                  header: 'Issue price',
                  width: 'w-24',
                  align: 'end',
                  cell: (r) => (
                    <span className="figure text-muted-foreground">
                      {sharePrice(r.listing?.issuePricePaise ?? r.issuePricePaise)}
                    </span>
                  ),
                },
                {
                  id: 'demand',
                  header: 'Subscribed',
                  width: 'w-24',
                  align: 'end',
                  cell: (r) => (
                    <span className="figure text-muted-foreground">
                      {times(r.subscription?.totalTimes ?? null)}
                    </span>
                  ),
                },
                {
                  id: 'day1',
                  header: 'Listing day',
                  width: 'w-24',
                  align: 'end',
                  cell: (r) => (
                    <PercentChange value={r.listing?.listingGainPercent ?? null} size="sm" />
                  ),
                },
                {
                  id: 'now',
                  header: 'Now',
                  width: 'w-24',
                  align: 'end',
                  cell: (r) => (
                    <PercentChange value={r.listing?.sinceIssuePercent ?? null} size="sm" />
                  ),
                },
              ]}
              mobile={(r) => ({
                title: r.companyName,
                sub: `Listed ${r.listingDate === null ? '—' : shortDate(r.listingDate)} · issue ${sharePrice(r.listing?.issuePricePaise ?? r.issuePricePaise)}`,
                value: <PercentChange value={r.listing?.listingGainPercent ?? null} size="sm" />,
                valueSub: (
                  <span className="inline-flex items-baseline gap-1">
                    now <PercentChange value={r.listing?.sinceIssuePercent ?? null} size="sm" />
                  </span>
                ),
                href: `/ipos/${r.slug}`,
              })}
            />
          )}
          {pageCount > 1 && (
            <footer className="flex items-center justify-end gap-1.5 border-border border-t px-4 py-2.5">
              {data.page > 1 && (
                <Link
                  href={listingsHref(data.board, data.year, currentYear, data.page - 1)}
                  className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-3 text-sm hover:bg-accent"
                >
                  Previous
                </Link>
              )}
              {data.page < pageCount && (
                <Link
                  href={listingsHref(data.board, data.year, currentYear, data.page + 1)}
                  className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-3 text-sm hover:bg-accent"
                >
                  Next
                </Link>
              )}
            </footer>
          )}
        </Card>
      </div>

      <p className="text-2xs text-muted-foreground">
        Listing day: the listing-day open against the issue price. Now: the latest close against the
        issue price. Prices are the exchange&apos;s end-of-day file; an issue without them shows a
        dash and is left out of the counts. {data.coverageNote}
      </p>
    </IpoSectionPage>
  );
}
