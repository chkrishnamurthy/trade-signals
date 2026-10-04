import { Card } from '@/components/ui/card';
import { dateRange, type IpoTone, shortDate } from '@/lib/ipo-format';
import type { IpoDetailDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';

type Place = 'done' | 'now' | 'ahead';

interface StageStep {
  readonly label: string;
  readonly detail: string;
  readonly place: Place;
}

/** Which of the five stages an issue is in; null when it left the path (withdrawn, postponed). */
function currentStage(ipo: IpoDetailDto): number | null {
  switch (ipo.status) {
    case 'upcoming':
      return 1;
    case 'open':
      return 2;
    case 'closed':
      return 3;
    case 'listed':
      return 4;
    default:
      return null;
  }
}

const TONE_DOT: Readonly<Record<Exclude<IpoTone, 'inactive'>, string>> = {
  info: 'border-info bg-info',
  open: 'border-bullish bg-bullish',
  waiting: 'border-warning bg-warning',
  listed: 'border-neutral-strong bg-neutral-strong',
};
const STAGE_TONE: readonly IpoTone[] = ['inactive', 'info', 'open', 'waiting', 'listed'];

/**
 * The issue's place among the five stages every IPO page uses — filed with
 * SEBI, upcoming, open for bids, allotment & listing, listed — with the date
 * each was or will be reached. The full timeline below holds every milestone;
 * this says at a glance where the issue is.
 */
export function IpoStageStepper({ ipo }: { ipo: IpoDetailDto }) {
  const now = currentStage(ipo);
  const at = (kind: string) => ipo.timeline.find((e) => e.kind === kind) ?? null;
  const allotment = at('allotment');
  const listing = at('listing');
  const filed = ipo.filings[0]?.filedDate ?? null;
  const place = (i: number): Place =>
    now === null
      ? i === 0 && filed !== null
        ? 'done'
        : 'ahead'
      : i < now
        ? 'done'
        : i === now
          ? 'now'
          : 'ahead';
  const steps: StageStep[] = [
    {
      label: 'Filed with SEBI',
      detail:
        filed !== null
          ? `DRHP ${shortDate(filed).slice(4)} ${filed.slice(0, 4)}`
          : ipo.board === 'sme'
            ? 'Draft filed with the exchange'
            : 'No SEBI filing matched',
      place: place(0),
    },
    {
      label: 'Upcoming',
      detail: ipo.openDate === null ? 'Dates not announced' : `Opens ${shortDate(ipo.openDate)}`,
      place: place(1),
    },
    {
      label: 'Open for bids',
      detail: dateRange(ipo.openDate, ipo.closeDate),
      place: place(2),
    },
    {
      label: 'Allotment & listing',
      detail:
        allotment === null
          ? '—'
          : `Allotment ${shortDate(allotment.date)}${allotment.expected ? '*' : ''}`,
      place: place(3),
    },
    {
      label: 'Listed',
      detail:
        ipo.listingDate !== null
          ? shortDate(ipo.listingDate)
          : listing === null
            ? '—'
            : `${shortDate(listing.date)}*`,
      place: place(4),
    },
  ];
  const expected =
    (allotment?.expected === true && (now === null || now <= 3)) ||
    (ipo.listingDate === null && listing !== null);

  return (
    <Card aria-label="Where this issue stands" className="px-4 py-3.5">
      <ol className="flex flex-col gap-3 sm:grid sm:grid-cols-5 sm:gap-0">
        {steps.map((s, i) => {
          const tone = STAGE_TONE[i] ?? 'inactive';
          return (
            <li
              key={s.label}
              aria-current={s.place === 'now' ? 'step' : undefined}
              className="relative flex flex-col gap-0.5 pl-6 sm:pt-5 sm:pr-3 sm:pl-0"
            >
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    // Down the left on a phone, across the top from `sm`.
                    'absolute top-4 -bottom-3 left-[0.375rem] w-0.5 sm:top-[0.4rem] sm:right-0 sm:bottom-auto sm:left-0 sm:h-0.5 sm:w-auto',
                    s.place === 'done' ? 'bg-foreground/40' : 'bg-border',
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  'absolute top-0.5 left-0 size-3.5 rounded-full border-2 sm:top-0',
                  s.place === 'ahead' && 'border-border-strong bg-surface',
                  s.place === 'done' && 'border-foreground/40 bg-foreground/40',
                  s.place === 'now' &&
                    cn(
                      tone === 'inactive' ? 'border-foreground bg-foreground' : TONE_DOT[tone],
                      'ring-4 ring-accent',
                    ),
                )}
              />
              <span
                className={cn(
                  'text-xs',
                  s.place === 'now' ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {s.label}
                {s.place === 'now' && <span className="sr-only"> (current stage)</span>}
              </span>
              <span
                className={cn(
                  'figure text-xs',
                  s.place === 'ahead' ? 'text-subtle-foreground' : 'text-foreground',
                )}
              >
                {s.detail}
              </span>
            </li>
          );
        })}
      </ol>
      {(expected || now === null) && (
        <p className="mt-2 text-2xs text-muted-foreground">
          {now === null && `This issue was ${ipo.status}. `}
          {expected && '* Expected, from SEBI’s T+3 timetable, until the exchange confirms it.'}
        </p>
      )}
    </Card>
  );
}
