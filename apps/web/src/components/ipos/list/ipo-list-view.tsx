import type { IpoStatus } from '@equitywise/shared';
import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';
import { Suspense } from 'react';
import { EmptyState } from '@/components/data-display/states';
import { AppShell } from '@/components/layout/app-shell';
import { PageContainer, PageContent } from '@/components/layout/page';
import { Card } from '@/components/ui/card';
import { shortDate } from '@/lib/ipo-format';
import {
  DEFAULT_SORT_DIR,
  IPO_LIST_SORT_KEYS,
  type IpoListSort,
  type IpoListSortKey,
} from '@/lib/ipo-list';
import { BOARD_SCOPE_WORD, IPO_SCOPES, type IpoScope, tableHref } from '@/lib/ipo-routes';
import type { IpoListPageDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { StateChip } from '../ipo-chip';
import { IpoFeeds } from '../ipo-feeds';
import { IpoGmpNote } from '../ipo-gmp-note';
import { RememberIpoReturn } from '../ipo-return';
import { IpoSectionHeader } from '../ipo-section-header';
import { IpoBoardTable } from './ipo-board-table';
import { IpoListSummary } from './ipo-list-summary';
import { ListControls } from './list-controls';

interface ListState {
  readonly status: IpoStatus | null;
  readonly year: number | null;
  readonly q: string;
  readonly page: number;
  readonly sort: IpoListSort;
}

/**
 * The address of this list with some filters changed; any filter or order
 * change goes back to page 1. The default order (by stage) and a column's own
 * first direction stay out of the URL.
 */
function listHref(
  scope: IpoScope,
  current: ListState,
  currentYear: number,
  change: Partial<ListState>,
): Route {
  const next = { ...current, page: 1, ...change };
  return tableHref(scope, {
    status: next.status,
    year: next.year === null ? 'all' : next.year !== currentYear ? String(next.year) : null,
    q: next.q === '' ? null : next.q,
    sort: next.sort.key === 'stage' ? null : next.sort.key,
    dir: next.sort.dir === DEFAULT_SORT_DIR[next.sort.key] ? null : next.sort.dir,
    page: next.page > 1 ? String(next.page) : null,
  });
}

/** Per sort key, the address of that order: `flip` turns the active key's direction. */
function sortHrefs(
  board: IpoScope,
  state: ListState,
  currentYear: number,
  flip: boolean,
): Record<IpoListSortKey, string> {
  const out = {} as Record<IpoListSortKey, string>;
  for (const key of IPO_LIST_SORT_KEYS) {
    const active = flip && state.sort.key === key;
    const dir = active ? (state.sort.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_SORT_DIR[key];
    out[key] = listHref(board, state, currentYear, { sort: { key, dir } });
  }
  return out;
}

const STATUS_PILLS: readonly { readonly id: IpoStatus | null; readonly label: string }[] = [
  { id: null, label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Allotment & listing' },
  { id: 'listed', label: 'Listed' },
  { id: 'withdrawn', label: 'Withdrawn' },
  { id: 'postponed', label: 'Postponed' },
];

/**
 * The master table (`/ipos/all`): every issue in scope in one table — status,
 * dates, price, the minimum application, size, demand, the unofficial GMP and
 * how listings went — under the IPO section's header, as its "All IPOs" tab.
 * Filters live in the URL; nothing here acts on an issue.
 */
export function IpoListView({ data }: { data: IpoListPageDto }) {
  const word = BOARD_SCOPE_WORD[data.board];
  const currentYear = Number(data.today.slice(0, 4));
  const state: ListState = { ...data.filters, page: data.page, sort: data.sort };
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const scopeHrefs = Object.fromEntries(
    IPO_SCOPES.map((s) => [s, listHref(s, state, currentYear, {})]),
  ) as Record<IpoScope, Route>;
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
      <Suspense fallback={null}>
        <RememberIpoReturn
          label={`All IPOs${data.filters.year === null ? '' : ` ${data.filters.year}`}`}
        />
      </Suspense>
      <PageContainer>
        <IpoSectionHeader
          section="all"
          scope={data.board}
          scopeHrefs={scopeHrefs}
          counts={{ all: all }}
          description={
            <>
              Every {word === '' ? '' : `${word} `}issue
              {data.filters.year === null ? '' : ` of ${data.filters.year}`} in one table: schedule,
              price, demand and how it listed. Open issues first.
            </>
          }
        />

        <PageContent className="pt-5">
          <IpoFeeds feeds={data.feeds} />

          <IpoListSummary
            summary={data.summary}
            today={data.today}
            year={data.filters.year}
            active={data.filters.status}
            hrefFor={(status) => listHref(data.board, state, currentYear, { status })}
          />

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
                sort={data.sort}
                sortHrefs={sortHrefs(data.board, state, currentYear, true)}
                defaultSortHrefs={sortHrefs(data.board, state, currentYear, false)}
                rangeLabel={`${from}–${to} of ${data.total}`}
                showBoard={data.board === 'all'}
                csvName={`${data.board}-ipos-${data.filters.year ?? 'all-years'}${
                  data.filters.status === null ? '' : `-${data.filters.status}`
                }${data.page > 1 ? `-page-${data.page}` : ''}.csv`}
              />
            )}
            <footer className="flex flex-col gap-2 border-border border-t px-4 py-2.5 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
              <span>
                Min. investment is the minimum order at the upper end of the band
                <span className="hidden lg:inline">
                  {' '}
                  · Demand bar: log scale, the tick is fully subscribed (1×)
                </span>
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
              {data.gmpPolicy.enabled &&
                ` GMP: ${data.gmpPolicy.sourceName}, unofficial${
                  data.gmpPolicy.trackedSince === null
                    ? ''
                    : `, recorded since ${shortDate(data.gmpPolicy.trackedSince)} — earlier issues have none`
                }.`}{' '}
              Listing: the exchange&apos;s end-of-day prices. {data.coverageNote}
            </p>
          </div>

          <IpoGmpNote gmpNote={data.gmpNote} show={data.gmpPolicy.enabled} />
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
