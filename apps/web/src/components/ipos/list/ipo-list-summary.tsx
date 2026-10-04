import type { IpoStatus } from '@equitywise/shared';
import type { Route } from 'next';
import Link from 'next/link';
import { dayLabel, type IpoTone, istDayTime, shortDate, shortName } from '@/lib/ipo-format';
import type { IpoListSummaryDto } from '@/lib/ipo-list';
import { cn } from '@/lib/utils';

const DOT: Readonly<Record<IpoTone, string>> = {
  open: 'bg-bullish',
  waiting: 'bg-warning',
  info: 'bg-info',
  listed: 'bg-neutral',
  inactive: 'bg-muted-foreground',
};

interface Tile {
  readonly status: IpoStatus;
  readonly tone: IpoTone;
  readonly label: string;
  readonly count: number;
  readonly detail: string;
}

/** `5:00 pm` out of `5 Oct, 5:00 pm`. */
function clockOf(iso: string): string {
  return istDayTime(iso).split(', ')[1] ?? '';
}

function tilesOf(summary: IpoListSummaryDto, today: string, year: number | null): Tile[] {
  const { open, upcoming, closed, listed } = summary;
  const closeLine = (() => {
    if (open.count === 0 || open.nextCloseDate === null) return 'Nothing open for bids now';
    const day = dayLabel(open.nextCloseDate, today);
    const when = day === 'today' || day === 'tomorrow' ? day : shortDate(open.nextCloseDate);
    const upi = open.upiCutoffAt === null ? '' : ` · UPI by ${clockOf(open.upiCutoffAt)}`;
    if (open.closingOnNext > 1) return `${open.closingOnNext} close ${when}${upi}`;
    return `Next closes ${when}${upi}`;
  })();
  return [
    {
      status: 'upcoming',
      tone: 'info',
      label: 'Upcoming',
      count: upcoming.count,
      detail:
        upcoming.next !== null
          ? `Next: ${shortName(upcoming.next.companyName)}, ${shortDate(upcoming.next.openDate)}`
          : upcoming.count > 0
            ? 'Dates not announced yet'
            : 'None announced',
    },
    { status: 'open', tone: 'open', label: 'Open for bids', count: open.count, detail: closeLine },
    {
      status: 'closed',
      tone: 'waiting',
      label: 'Allotment & listing',
      count: closed.count,
      detail:
        closed.next !== null
          ? `Next listing: ${shortName(closed.next.companyName)}, ${shortDate(closed.next.listingDate)}${closed.next.expected ? '*' : ''}`
          : 'No listing dates pending',
    },
    {
      status: 'listed',
      tone: 'listed',
      label: year === null ? 'Listed' : `Listed in ${year}`,
      count: listed.count,
      detail:
        listed.withLatestClose === 0
          ? 'No closing prices recorded yet'
          : `${listed.aboveIssue} of ${listed.withLatestClose} above issue price at last close`,
    },
  ];
}

/**
 * The four tiles above the board list: how many issues are in each stage and
 * the next thing that happens in it. Each tile is a filter link; the active
 * one links back to every status. Counts, never a verdict on an issue.
 */
export function IpoListSummary({
  summary,
  today,
  year,
  active,
  hrefFor,
}: {
  summary: IpoListSummaryDto;
  today: string;
  /** Null = every year. */
  year: number | null;
  active: IpoStatus | null;
  hrefFor: (status: IpoStatus | null) => Route;
}) {
  return (
    <section aria-label="At a glance" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      {tilesOf(summary, today, year).map((tile) => {
        const on = active === tile.status;
        return (
          <Link
            key={tile.status}
            href={hrefFor(on ? null : tile.status)}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-col gap-1 rounded-lg border bg-surface p-3 shadow-subtle transition-colors sm:px-4 sm:py-3.5',
              'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
              on
                ? 'border-foreground ring-1 ring-foreground ring-inset'
                : 'border-border hover:border-border-strong hover:bg-accent/40',
            )}
          >
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[tile.tone])} />
              <span className="truncate">{tile.label}</span>
            </span>
            <span className="font-display font-semibold text-2xl tabular-nums leading-tight sm:text-3xl">
              {tile.count}
            </span>
            <span className="line-clamp-2 text-foreground text-xs sm:text-sm">{tile.detail}</span>
          </Link>
        );
      })}
    </section>
  );
}
