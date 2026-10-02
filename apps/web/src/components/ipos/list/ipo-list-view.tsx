import type { IpoBoard, IpoStatus } from '@equitywise/shared';
import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import {
  PageActions,
  PageBreadcrumb,
  PageContainer,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from '@/components/layout/page';
import { Card } from '@/components/ui/card';
import { BOARD_LABEL, BOARD_WORD } from '@/lib/ipo-format';
import type { IpoListPageDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { BoardTabs } from '../board-tabs';
import { StateChip } from '../ipo-chip';
import { IpoDisclaimer } from '../ipo-disclaimer';
import { IpoFeeds } from '../ipo-feeds';
import { IpoBoardTable } from './ipo-board-table';
import { ListControls } from './list-controls';

const BOARD_HREFS = { mainboard: '/ipos/mainboard', sme: '/ipos/sme' } as const satisfies Record<
  IpoBoard,
  Route
>;

interface ListState {
  readonly status: IpoStatus | null;
  readonly year: number | null;
  readonly q: string;
  readonly page: number;
}

/** The address of this list with some filters changed; any filter change goes back to page 1. */
function listHref(
  board: IpoBoard,
  current: ListState,
  currentYear: number,
  change: Partial<ListState>,
): Route {
  const next = { ...current, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.status !== null) params.set('status', next.status);
  if (next.year === null) params.set('year', 'all');
  else if (next.year !== currentYear) params.set('year', String(next.year));
  if (next.q !== '') params.set('q', next.q);
  if (next.page > 1) params.set('page', String(next.page));
  const qs = params.toString();
  return `${BOARD_HREFS[board]}${qs === '' ? '' : `?${qs}`}` as Route;
}

const STATUS_PILLS: readonly { readonly id: IpoStatus | null; readonly label: string }[] = [
  { id: null, label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closed', label: 'Closed' },
  { id: 'listed', label: 'Listed' },
  { id: 'withdrawn', label: 'Withdrawn' },
  { id: 'postponed', label: 'Postponed' },
];

/**
 * One board's issues in one table (`/ipos/mainboard`, `/ipos/sme`): status,
 * dates, price, the minimum application, size, demand, the unofficial GMP and
 * how listings went. Filters live in the URL; nothing here acts on an issue.
 */
export function IpoListView({ data }: { data: IpoListPageDto }) {
  const board = BOARD_LABEL[data.board];
  const currentYear = Number(data.today.slice(0, 4));
  const state: ListState = { ...data.filters, page: data.page };
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  const filtered = data.filters.status !== null || data.filters.q !== '';
  // The four everyday states always show; withdrawn and postponed only when they occur.
  const pills = STATUS_PILLS.filter(
    (p) =>
      p.id === null ||
      p.id === data.filters.status ||
      data.counts[p.id] > 0 ||
      (p.id !== 'withdrawn' && p.id !== 'postponed'),
  );

  return (
    <AppShell>
      <PageContainer>
        <PageHeader className="gap-y-3">
          <PageHeading>
            <PageBreadcrumb trail={[{ href: '/ipos', label: 'IPO dashboard' }]} />
            <PageTitle>
              {board} IPOs{data.filters.year === null ? '' : ` ${data.filters.year}`}
            </PageTitle>
            <PageDescription>
              Every {BOARD_WORD[data.board]} issue
              {data.filters.year === null ? '' : ` of ${data.filters.year}`} in one table, newest
              bidding dates first.
            </PageDescription>
          </PageHeading>
          <PageActions className="w-full sm:w-auto">
            <BoardTabs active={data.board} hrefs={BOARD_HREFS} />
          </PageActions>
        </PageHeader>

        <PageContent>
          <IpoFeeds feeds={data.feeds} />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="Status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ul className="flex w-max gap-1.5">
                {pills.map((p) => {
                  const on = data.filters.status === p.id;
                  const count = p.id === null ? all : data.counts[p.id];
                  return (
                    <li key={p.id ?? 'all'}>
                      <Link
                        href={listHref(data.board, state, currentYear, { status: p.id })}
                        aria-current={on ? 'page' : undefined}
                        scroll={false}
                        className={cn(
                          'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                          on
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-surface text-foreground hover:bg-accent',
                        )}
                      >
                        {p.label}
                        <span
                          className={cn(
                            'figure text-xs',
                            on ? 'text-background/75' : 'text-muted-foreground',
                          )}
                        >
                          {count}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <ListControls
              years={data.years}
              year={data.filters.year}
              currentYear={currentYear}
              q={data.filters.q}
            />
          </div>

          <Card className="overflow-hidden">
            {data.rows.length === 0 ? (
              <EmptyState
                title={filtered ? 'No IPO matches these filters' : 'No IPOs here yet'}
                description={
                  filtered
                    ? 'Try another status, year or search.'
                    : 'Issues appear here once the exchange publishes them.'
                }
              />
            ) : (
              <IpoBoardTable
                rows={data.rows}
                today={data.today}
                gmpEnabled={data.gmpPolicy.enabled}
              />
            )}
            <footer className="flex flex-col gap-2 border-border border-t px-4 py-2.5 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
              <span>
                {data.total === 0 ? 'No issues' : `${from}–${to} of ${data.total}`} · Min.
                investment is the minimum order at the upper end of the band
              </span>
              {pageCount > 1 && (
                <span className="flex gap-1.5">
                  <PageLink
                    href={listHref(data.board, state, currentYear, { page: data.page - 1 })}
                    disabled={data.page <= 1}
                  >
                    Previous
                  </PageLink>
                  <PageLink
                    href={listHref(data.board, state, currentYear, { page: data.page + 1 })}
                    disabled={data.page >= pageCount}
                  >
                    Next
                  </PageLink>
                </span>
              )}
            </footer>
          </Card>

          <div className="flex flex-col gap-2 text-muted-foreground text-xs lg:flex-row lg:items-start lg:justify-between">
            <ul className="flex flex-wrap items-center gap-1.5" aria-label="Row colours">
              <li>
                <StateChip tone="open" dot>
                  Open for bids
                </StateChip>
              </li>
              <li>
                <StateChip tone="waiting" dot>
                  Closed, yet to list
                </StateChip>
              </li>
              <li>
                <StateChip tone="listed" dot>
                  Listed
                </StateChip>
              </li>
            </ul>
            <p className="lg:max-w-xl lg:text-right">
              * Expected, from SEBI&apos;s T+3 timetable · † Part of the issue size priced at the
              upper end of the band.
              {data.gmpPolicy.enabled && ` GMP: ${data.gmpPolicy.sourceName}, unofficial.`} Listing:
              the exchange&apos;s end-of-day prices. {data.coverageNote}
            </p>
          </div>

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

function PageLink({
  href,
  disabled,
  children,
}: {
  href: Route;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const cls =
    'inline-flex h-9 items-center rounded-full border border-border bg-surface px-3 text-foreground text-sm';
  if (disabled)
    return (
      <span aria-disabled="true" className={cn(cls, 'opacity-50')}>
        {children}
      </span>
    );
  return (
    <Link href={href} className={cn(cls, 'hover:bg-accent')}>
      {children}
    </Link>
  );
}
