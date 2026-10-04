import {
  CalendarDaysIcon,
  FileTextIcon,
  type LucideIcon,
  TableIcon,
  TimerIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { type IpoSectionId, sectionHref } from '@/lib/ipo-routes';
import type { IpoDashboardDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { UnofficialTag } from '../ipo-chip';

interface Entry {
  readonly id: Exclude<IpoSectionId, 'overview'>;
  readonly title: string;
  readonly text: string;
  readonly figure: string;
  readonly icon: LucideIcon;
  readonly unofficial?: boolean;
}

/**
 * Everything the IPO section holds, as the same five places as the tabs —
 * each with what it is and one live figure — so the Overview ends by saying
 * where to go next.
 */
export function SectionDirectory({ data }: { data: IpoDashboardDto }) {
  const total = Object.values(data.yearCounts).reduce((a, b) => a + b, 0);
  const events = data.agenda.reduce((n, d) => n + d.events.length, 0);
  const entries: Entry[] = [
    {
      id: 'all',
      title: 'All IPOs',
      text: 'Every issue in one sortable table: schedule, price, demand, GMP and listing. Columns, density and CSV.',
      figure: `${total} issues in ${data.yearStats.year}`,
      icon: TableIcon,
    },
    {
      id: 'calendar',
      title: 'Calendar',
      text: 'Bidding windows, allotment and listing days on one timeline, with registrar links on allotment day.',
      figure: `${events} milestones in the next five trading days`,
      icon: CalendarDaysIcon,
    },
    {
      id: 'listings',
      title: 'Listings',
      text: 'How every issue opened and trades now against its issue price, month by month.',
      figure: `${data.yearStats.listed} listed in ${data.yearStats.year}`,
      icon: TrendingUpIcon,
    },
    ...(data.gmpPolicy.enabled
      ? [
          {
            id: 'gmp' as const,
            title: 'Grey market',
            text: 'Quoted premiums for unlisted issues, and how the last quote compared with listings.',
            figure: `${data.gmp.length} issue${data.gmp.length === 1 ? '' : 's'} quoted`,
            icon: TimerIcon,
            unofficial: true,
          },
        ]
      : []),
    {
      id: 'pipeline',
      title: 'Pipeline',
      text: 'Draft prospectuses filed with SEBI, issues without dates, and offer documents ahead.',
      figure:
        data.filedRecently === null
          ? data.board === 'sme'
            ? 'SME drafts are filed with the exchange'
            : 'SEBI filings not collected'
          : `${data.filedRecently} filed in ${data.filedDays} days`,
      icon: FileTextIcon,
    },
  ];
  return (
    <section aria-labelledby="ipo-directory" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="ipo-directory" className="font-semibold text-sm tracking-tight">
          Everything in IPOs
        </h2>
        <p className="text-muted-foreground text-xs">The same places as the tabs above</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {entries.map((e) => (
          <li key={e.id} className="flex">
            <Link
              href={sectionHref(e.id, data.board) as Route}
              className={cn(
                'flex w-full flex-col gap-2 rounded-lg border bg-surface p-4 shadow-subtle transition-colors hover:border-border-strong hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring',
                e.unofficial ? 'border-warning-line' : 'border-border',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-8 place-items-center rounded-md',
                    e.unofficial ? 'bg-warning-soft text-warning-foreground' : 'bg-muted',
                  )}
                >
                  <e.icon className="size-4" />
                </span>
                {e.unofficial && <UnofficialTag />}
              </span>
              <span className="font-semibold text-sm">{e.title}</span>
              <span className="text-muted-foreground text-xs">{e.text}</span>
              <span className="figure mt-auto pt-1 text-2xs text-muted-foreground">{e.figure}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
