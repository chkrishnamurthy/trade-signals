import type { Route } from 'next';
import type * as React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import {
  awaitingListing,
  BOARD_LABEL,
  BOARD_WORD,
  dayLabel,
  istDayTime,
  shortDate,
  shortName,
} from '@/lib/ipo-format';
import type { IpoDashboardDto, IpoListItemDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { BoardTabs } from '../board-tabs';
import { IpoDisclaimer } from '../ipo-disclaimer';
import { IpoFeeds } from '../ipo-feeds';
import { AgendaModule, AllotmentModule, DocumentsModule, FilingsModule } from './calendar-modules';
import { CurrentModule, GmpModule, ListingsModule, SubscriptionModule } from './issue-modules';

const BOARD_HREFS = { mainboard: '/ipos', sme: '/ipos?board=sme' } as const satisfies Record<
  string,
  Route
>;

/** A headline figure: the label, the number large, and what it counts. */
function HeadlineStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-subtle sm:px-4 sm:py-3.5">
      <span className="truncate text-muted-foreground text-xs">{label}</span>
      <span className="figure font-medium text-2xl text-foreground tracking-tight">{value}</span>
      <span className="truncate text-2xs text-muted-foreground" title={hint}>
        {hint}
      </span>
    </div>
  );
}

const ratio = (part: number, whole: number) => (whole === 0 ? '—' : `${part} / ${whole}`);

function listingRange(rows: readonly IpoListItemDto[]): string {
  const dates = rows
    .filter(awaitingListing)
    .map((r) => r.listingDate ?? r.expectedListingDate)
    .filter((d): d is string => d !== null)
    .sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined) return 'none waiting';
  return first === last
    ? `listing ${shortDate(first)}`
    : `listing ${shortDate(first)} – ${shortDate(last)}`;
}

/** Six figures for the board this year — counts and outcomes, never a rating. */
function HeadlineStats({ data }: { data: IpoDashboardDto }) {
  const { yearStats: y, counts } = data;
  const open = data.current.filter((r) => r.status === 'open');
  const firstClose = open
    .map((r) => r.closeDate)
    .filter((d): d is string => d !== null)
    .sort()[0];
  const nextOpen = data.current
    .filter((r) => r.status === 'upcoming' && r.openDate !== null)
    .map((r) => r.openDate as string)
    .sort()[0];
  const board = BOARD_WORD[data.board];
  return (
    <section
      aria-label={`${BOARD_LABEL[data.board]} IPOs at a glance`}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6"
    >
      <HeadlineStat
        label={`Listed in ${y.year}`}
        value={y.listed}
        hint={`${board} issues since 1 Jan`}
      />
      <HeadlineStat
        label="Open now"
        value={counts.open}
        hint={
          open.length === 0
            ? 'none open today'
            : open.length <= 2
              ? open.map((r) => shortName(r.companyName)).join(' · ')
              : firstClose === undefined
                ? `${open.length} accepting bids`
                : `first closes ${dayLabel(firstClose, data.today)}`
        }
      />
      <HeadlineStat
        label="Yet to list"
        value={data.awaitingListing}
        hint={listingRange(data.current)}
      />
      <HeadlineStat
        label="Upcoming"
        value={counts.upcoming}
        hint={
          counts.upcoming === 0
            ? 'none announced yet'
            : nextOpen === undefined
              ? 'dates not announced'
              : `next opens ${shortDate(nextOpen)}`
        }
      />
      <HeadlineStat
        label="Opened above issue price"
        value={ratio(y.openedAboveIssue, y.withListingPrice)}
        hint={
          y.withListingPrice === y.listed
            ? `${y.year} listings, at the listing-day open`
            : `${y.withListingPrice} of ${y.listed} listings have prices`
        }
      />
      <HeadlineStat
        label="Above issue price now"
        value={ratio(y.latestAboveIssue, y.withLatestClose)}
        hint="at the latest close"
      />
    </section>
  );
}

/**
 * The IPO dashboard (`/ipos`): one board's issues right now, as a grid of
 * compact modules — open and upcoming issues, demand, the unofficial GMP,
 * listing performance, the next five days, allotment, documents and SEBI
 * filings. Facts with their sources; no element applies for, bids on or rates
 * anything. Two columns from `lg`; one below, with rows folding on a phone.
 */
export function IpoDashboardView({ data }: { data: IpoDashboardDto }) {
  const modules: React.ReactNode[] = [
    <CurrentModule key="current" data={data} />,
    <SubscriptionModule key="subscription" data={data} />,
    data.gmpPolicy.enabled ? <GmpModule key="gmp" data={data} /> : null,
    <ListingsModule key="listings" data={data} />,
    <AgendaModule key="agenda" data={data} />,
    <AllotmentModule key="allotment" data={data} />,
    <DocumentsModule key="documents" data={data} />,
    data.board === 'mainboard' && data.filings.length > 0 ? (
      <FilingsModule key="filings" data={data} />
    ) : null,
  ].filter((m) => m !== null);

  return (
    <AppShell>
      <PageContainer>
        <PageHeader className="gap-y-3">
          <PageHeading>
            <PageTitle>IPO dashboard</PageTitle>
            <PageDescription>
              Indian IPOs today: what is open, how it is being bid, what lists next and how recent
              listings have done. Facts from the exchanges and SEBI.
            </PageDescription>
          </PageHeading>
          <PageActions className="w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
            <BoardTabs active={data.board} hrefs={BOARD_HREFS} />
            <span className="text-2xs text-muted-foreground">
              {data.asOf === null
                ? 'Exchange data not collected yet'
                : `Exchange data as of ${istDayTime(data.asOf)} IST`}
            </span>
          </PageActions>
        </PageHeader>

        <PageContent>
          <IpoFeeds feeds={data.feeds} showAsOf={false} />
          <HeadlineStats data={data} />
          <div
            className={cn(
              'grid items-stretch gap-4 lg:grid-cols-2',
              modules.length % 2 === 1 && 'lg:[&>*:last-child]:col-span-2',
            )}
          >
            {modules}
          </div>
          <p className="text-2xs text-muted-foreground">{data.coverageNote}</p>
          <IpoDisclaimer
            disclaimer={data.disclaimer}
            gmpNote={data.gmpNote}
            showGmp={data.gmpPolicy.enabled}
          />
        </PageContent>
      </PageContainer>
    </AppShell>
  );
}
