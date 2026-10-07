import { ArrowRightIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { dayLabel, type IpoTone, istDayTime, shortDate, shortName } from '@/lib/ipo-format';
import { sectionHref, tableHref } from '@/lib/ipo-routes';
import type { IpoDashboardDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { StateChip } from '../ipo-chip';

interface Stage {
  readonly id: string;
  readonly label: string;
  readonly tone: IpoTone;
  readonly value: string;
  readonly hint: string;
  readonly href: Route | null;
  readonly go: string;
  readonly current?: boolean;
}

/** The soonest of some date keys. */
const first = (dates: readonly (string | null)[]) =>
  dates.filter((d): d is string => d !== null).sort()[0] ?? null;

/**
 * Where every issue stands, as the five stages of an IPO's life. The same
 * words and colours label the master table's status filters and each issue's
 * own stage, and each stage here opens its list — so this strip is both the
 * summary and the way in. Counts and dates only, never a view of any issue.
 */
export function StageRail({ data }: { data: IpoDashboardDto }) {
  const scope = data.board;
  const y = data.yearStats;
  const firstClose = first(data.open.map((r) => r.closeDate));
  const upi = data.open.find((r) => r.closeDate === firstClose && r.upiCutoffAt !== null);
  const nextOpen = data.upcoming.find((r) => r.openDate !== null);
  const listing = first(
    data.allotment.map((r) => r.listingDate).filter((d) => d !== null && d >= data.today),
  );
  const stages: Stage[] = [
    {
      id: 'filed',
      label: 'Filed with SEBI',
      tone: 'inactive',
      value: data.filedRecently === null ? '—' : String(data.filedRecently),
      hint:
        scope === 'sme'
          ? 'SME drafts are filed with the exchange'
          : data.filedRecently === null
            ? 'SEBI filings are not being collected'
            : `draft prospectuses, last ${data.filedDays} days`,
      href: sectionHref('pipeline', scope),
      go: 'Pipeline',
    },
    {
      id: 'upcoming',
      label: 'Upcoming',
      tone: 'info',
      value: String(data.yearCounts.upcoming),
      hint:
        nextOpen?.openDate == null
          ? data.yearCounts.upcoming === 0
            ? 'none announced yet'
            : 'dates not announced'
          : `next opens ${shortDate(nextOpen.openDate)}`,
      href: tableHref(scope, { status: 'upcoming' }),
      go: 'Upcoming issues',
    },
    {
      id: 'open',
      label: 'Open for bids',
      tone: 'open',
      value: String(data.open.length),
      hint:
        firstClose === null
          ? 'none open today'
          : upi?.upiCutoffAt != null
            ? `first closes ${dayLabel(firstClose, data.today)}, UPI by ${istDayTime(upi.upiCutoffAt).split(', ')[1]}`
            : `first closes ${dayLabel(firstClose, data.today)}`,
      href: tableHref(scope, { status: 'open' }),
      go: 'Open issues',
      current: data.open.length > 0,
    },
    {
      id: 'closed',
      label: 'Allotment & listing',
      tone: 'waiting',
      value: String(data.awaitingListing),
      hint:
        data.awaitingListing === 0
          ? 'none waiting to list'
          : listing === null
            ? 'closed, waiting to list'
            : `next lists ${shortDate(listing)}`,
      href: tableHref(scope, { status: 'closed' }),
      go: 'Closed issues',
    },
    {
      id: 'listed',
      label: `Listed in ${y.year}`,
      tone: 'listed',
      value: String(y.listed),
      hint:
        y.withLatestClose === 0
          ? 'no closing prices yet'
          : `${y.latestAboveIssue} of ${y.withLatestClose} above issue price now`,
      href: sectionHref('listings', scope),
      go: 'Listings',
    },
  ];

  return (
    <section aria-labelledby="ipo-stages" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="ipo-stages" className="font-semibold text-sm tracking-tight">
          Where every issue stands
        </h2>
        <p className="text-muted-foreground text-xs">
          {nextOpen !== undefined && data.open.length === 0
            ? `Nothing is open; ${shortName(nextOpen.companyName)} opens ${shortDate(nextOpen.openDate)}.`
            : 'Each stage opens its list.'}
        </p>
      </div>
      <ol className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
        {stages.map((s, i) => {
          const body = (
            <>
              <span className="flex items-center justify-between gap-2">
                <StateChip tone={s.tone} dot>
                  {s.label}
                </StateChip>
                <span aria-hidden className="figure text-2xs text-subtle-foreground">
                  {i + 1}
                </span>
              </span>
              <span className="figure font-medium text-2xl text-foreground tracking-tight">
                {s.value}
              </span>
              <span className="text-muted-foreground text-xs">{s.hint}</span>
              {s.href !== null && (
                <span className="mt-auto inline-flex items-center gap-1 pt-1 font-medium text-primary-strong text-xs">
                  {s.go}
                  <ArrowRightIcon aria-hidden className="size-3" />
                </span>
              )}
            </>
          );
          const box = cn(
            'flex h-full min-w-44 snap-start flex-col gap-1.5 rounded-lg border bg-surface px-3.5 py-3 shadow-subtle sm:min-w-0',
            s.current ? 'border-bullish-line ring-1 ring-bullish-line ring-inset' : 'border-border',
          );
          return (
            <li key={s.id} className="flex">
              {s.href === null ? (
                <div className={box}>{body}</div>
              ) : (
                <Link
                  href={s.href}
                  className={cn(
                    box,
                    'w-full transition-colors hover:border-border-strong hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring',
                  )}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
