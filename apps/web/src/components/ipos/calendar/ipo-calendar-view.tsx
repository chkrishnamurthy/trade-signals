import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { shortDate } from '@/lib/ipo-format';
import { type IpoScope, issueHref, sectionHref } from '@/lib/ipo-routes';
import type { IpoCalendarPageDto, IpoCalendarRowDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { AgendaModule, AllotmentModule } from '../dashboard/calendar-modules';
import { SmeMark } from '../ipo-cells';
import { bandText } from '../ipo-figures';
import { IpoSectionPage } from '../ipo-section-page';

const calendarHref = (scope: IpoScope, from: string | null) =>
  sectionHref('calendar', scope, { from });

/** A bar's colour by the issue's state: open green, upcoming blue, the rest quiet. */
const BAR: Readonly<Record<string, string>> = {
  open: 'bg-bullish-soft text-bullish-strong ring-bullish-line',
  upcoming: 'bg-info-soft text-info-strong ring-info-line',
};

/** The first and last window columns a span covers, or null when it misses the window. */
function span(
  days: readonly { date: string }[],
  start: string,
  end: string,
): { first: number; last: number } | null {
  const first = days.findIndex((d) => d.date >= start);
  let last = -1;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if ((days[i]?.date ?? '') <= end) {
      last = i;
      break;
    }
  }
  return first === -1 || last === -1 || first > last ? null : { first, last };
}

const column = (days: readonly { date: string }[], date: string) =>
  days.findIndex((d) => d.date === date);

function Marker({
  kind,
  expected,
  col,
  label,
}: {
  kind: 'allotment' | 'listing';
  expected: boolean;
  col: number;
  label: string;
}) {
  return (
    <span
      title={label}
      className="z-10 row-start-1 inline-flex justify-self-center"
      style={{ gridColumn: col + 1 }}
    >
      <span
        aria-hidden
        className={cn(
          'block',
          kind === 'allotment' ? 'size-2.5 rotate-45 rounded-[2px]' : 'size-3 rounded-full',
          kind === 'allotment'
            ? expected
              ? 'bg-surface ring-2 ring-warning ring-inset'
              : 'bg-warning'
            : expected
              ? 'bg-surface ring-2 ring-info ring-inset'
              : 'bg-info',
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function TimelineRow({
  row,
  data,
  todayCol,
}: {
  row: IpoCalendarRowDto;
  data: IpoCalendarPageDto;
  todayCol: number;
}) {
  const days = data.days;
  const bid =
    row.openDate === null ? null : span(days, row.openDate, row.closeDate ?? row.openDate);
  const clippedStart = row.openDate !== null && row.openDate < data.from;
  const closeText = row.closeDate === null ? '' : shortDate(row.closeDate).slice(0, -4);
  const barText =
    row.status === 'open'
      ? `Bidding · closes ${closeText}`
      : row.status === 'upcoming' && row.openDate !== null
        ? `Opens ${shortDate(row.openDate).slice(0, -4)}`
        : 'Bidding';
  const allotCol = row.allotment === null ? -1 : column(days, row.allotment.date);
  const listCol = row.listing === null ? -1 : column(days, row.listing.date);
  return (
    <div className="grid grid-cols-[14rem_minmax(0,1fr)] border-border border-b last:border-0">
      <div className="flex min-w-0 flex-col justify-center border-border border-r px-4 py-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link
            href={issueHref(row.slug)}
            title={row.companyName}
            className="truncate font-medium text-sm underline-offset-4 hover:underline"
          >
            {row.companyName}
          </Link>
          {data.board === 'all' && row.board === 'sme' && <SmeMark />}
        </span>
        <span className="figure truncate text-2xs text-muted-foreground">
          {row.priceBand === null ? 'Band awaited' : bandText(row.priceBand)}
        </span>
      </div>
      <div
        className="relative grid items-center"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((d, i) => (
          <span
            key={d.date}
            aria-hidden
            className={cn(
              'row-start-1 self-stretch border-border border-l first:border-l-0',
              !d.trading &&
                'bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_5px,transparent_5px_10px)]',
              i === todayCol && 'shadow-[inset_2px_0_0_var(--color-primary)]',
            )}
            style={{ gridColumn: i + 1 }}
          />
        ))}
        {bid !== null && (
          <Link
            href={issueHref(row.slug)}
            className={cn(
              'z-10 row-start-1 mx-1 flex h-5 items-center overflow-hidden whitespace-nowrap rounded-full px-2 font-medium text-[0.65rem] ring-1 ring-inset',
              BAR[row.status] ?? 'bg-muted text-muted-foreground ring-border',
              clippedStart && 'ml-0 rounded-l-sm',
            )}
            style={{ gridColumn: `${bid.first + 1} / ${bid.last + 2}` }}
            title={`${row.companyName}: bidding ${row.openDate ?? ''} to ${row.closeDate ?? ''}`}
          >
            {bid.last > bid.first ? barText : ''}
          </Link>
        )}
        {allotCol !== -1 && row.allotment !== null && (
          <Marker
            kind="allotment"
            expected={row.allotment.expected}
            col={allotCol}
            label={`Allotment ${shortDate(row.allotment.date)}${row.allotment.expected ? ' (expected)' : ''}`}
          />
        )}
        {listCol !== -1 && row.listing !== null && (
          <Marker
            kind="listing"
            expected={row.listing.expected}
            col={listCol}
            label={`Listing ${shortDate(row.listing.date)}${row.listing.expected ? ' (expected)' : ''}`}
          />
        )}
      </div>
    </div>
  );
}

function Legend() {
  const item = 'inline-flex items-center gap-1.5';
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground text-xs">
      <li className={item}>
        <span
          aria-hidden
          className="h-2.5 w-6 rounded-full bg-bullish-soft ring-1 ring-bullish-line ring-inset"
        />
        Bidding — open now
      </li>
      <li className={item}>
        <span
          aria-hidden
          className="h-2.5 w-6 rounded-full bg-info-soft ring-1 ring-info-line ring-inset"
        />
        Bidding — upcoming
      </li>
      <li className={item}>
        <span
          aria-hidden
          className="h-2.5 w-6 rounded-full bg-muted ring-1 ring-border ring-inset"
        />
        Bidding — closed
      </li>
      <li className={item}>
        <span aria-hidden className="size-2.5 rotate-45 rounded-[2px] bg-warning" />
        Allotment
      </li>
      <li className={item}>
        <span aria-hidden className="size-3 rounded-full bg-info" />
        Listing
      </li>
      <li className={item}>
        <span aria-hidden className="size-3 rounded-full bg-surface ring-2 ring-info ring-inset" />
        Hollow = expected (SEBI T+3)
      </li>
      <li className={item}>
        <span
          aria-hidden
          className="h-2.5 w-6 rounded-sm bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_4px,transparent_4px_8px)] ring-1 ring-border ring-inset"
        />
        Exchange holiday
      </li>
    </ul>
  );
}

/**
 * The IPO calendar (`/ipos/calendar`): three weeks of trading days with each
 * issue's bidding window as a bar and its allotment and listing days as
 * markers, then the same milestones day by day — the phone's view — and the
 * registrar links for allotments in the window. Expected dates (SEBI's T+3)
 * are drawn hollow and starred until the exchange confirms them.
 */
export function IpoCalendarView({ data }: { data: IpoCalendarPageDto }) {
  const todayCol = data.days.findIndex((d) => d.date >= data.today);
  const navLink =
    'inline-flex h-10 items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm transition-colors hover:bg-accent sm:h-8';
  const inWindow = data.today >= data.from && data.today <= data.to;
  return (
    <IpoSectionPage
      section="calendar"
      scope={data.board}
      scopeHref={(s) => calendarHref(s, inWindow ? null : data.from)}
      asOf={data.asOf}
      feeds={data.feeds}
      rememberLabel="IPO calendar"
      description="Bidding windows, allotment and listing days on one timeline, three weeks at a time. Dates are the exchange's; a starred or hollow one is expected from SEBI's T+3 timetable."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Weeks" className="flex flex-wrap items-center gap-2">
          <Link href={calendarHref(data.board, data.prevFrom)} className={navLink} scroll={false}>
            <ChevronLeftIcon aria-hidden className="size-4" />
            Earlier
          </Link>
          <Link
            href={calendarHref(data.board, null)}
            aria-current={inWindow ? 'page' : undefined}
            className={cn(navLink, inWindow && 'border-foreground')}
            scroll={false}
          >
            This week
          </Link>
          <Link href={calendarHref(data.board, data.nextFrom)} className={navLink} scroll={false}>
            Later
            <ChevronRightIcon aria-hidden className="size-4" />
          </Link>
        </nav>
        <p className="font-medium text-sm">
          {shortDate(data.from)} – {shortDate(data.to)} {data.to.slice(0, 4)}
        </p>
      </div>

      <Card className="hidden overflow-hidden md:block" aria-label="IPO timeline">
        <div className="flex flex-col gap-2 border-border border-b px-4 py-3">
          <h2 className="font-semibold text-sm tracking-tight">Timeline</h2>
          <Legend />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[56rem]">
            <div className="grid grid-cols-[14rem_minmax(0,1fr)] border-border border-b bg-surface-sunken">
              <div className="flex items-center border-border border-r px-4 py-2 text-muted-foreground text-xs">
                Issue
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${data.days.length}, minmax(0, 1fr))` }}
              >
                {data.days.map((d, i) => {
                  const label = shortDate(d.date);
                  return (
                    <span
                      key={d.date}
                      className={cn(
                        'flex flex-col items-center border-border border-l py-1.5 text-2xs leading-tight first:border-l-0',
                        i === todayCol && 'shadow-[inset_2px_0_0_var(--color-primary)]',
                      )}
                    >
                      <span className="text-muted-foreground">
                        {i === todayCol && d.date !== data.today ? 'Next' : label.slice(0, 3)}
                      </span>
                      <span
                        className={cn(
                          'figure font-semibold text-xs',
                          !d.trading && 'text-muted-foreground line-through',
                          d.date === data.today && 'text-primary',
                        )}
                      >
                        {label.slice(4).replace(` ${label.slice(-3)}`, '')}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            {data.rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-muted-foreground text-sm">
                No IPO bids, allots or lists in these three weeks.
              </p>
            ) : (
              data.rows.map((row) => (
                <TimelineRow key={row.slug} row={row} data={data} todayCol={todayCol} />
              ))
            )}
          </div>
        </div>
      </Card>

      {/* The timeline's own phone view: the same milestones, day by day. */}
      <AgendaModule
        data={data}
        title="Day by day"
        note={`Every milestone from ${shortDate(data.from)} to ${shortDate(data.to)}.`}
        className="md:hidden"
      />
      <AllotmentModule data={data} />
      <p className="text-2xs text-muted-foreground">
        The same events appear on the{' '}
        <Link href={'/calendar' as Route} className="text-primary hover:underline">
          Market Calendar
        </Link>{' '}
        beside results and corporate actions. {data.coverageNote}
      </p>
    </IpoSectionPage>
  );
}
