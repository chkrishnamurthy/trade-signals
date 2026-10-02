import { AGENDA_LABEL, istDayTime, shortDate } from '@/lib/ipo-format';
import type { IpoDetailDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { StateChip } from '../ipo-chip';
import { ModuleCard } from '../module-card';

type Step = 'done' | 'next' | 'ahead';

interface Row {
  readonly key: string;
  readonly label: string;
  readonly date: string;
  readonly when: string;
  readonly step: Step;
  readonly chip: string;
}

const LABEL: Readonly<Record<string, string>> = {
  ...AGENDA_LABEL,
  opens: 'Bidding opens',
  closes: 'Bidding closes',
  refunds: 'Refunds initiated',
  demat_credit: 'Shares credited to demat',
};

/**
 * Each milestone with where it stands: done, next, or ahead — and whether
 * the date is the exchange's or computed from SEBI's T+3 rule. The UPI
 * mandate cut-off sits beside the close, since it is the deadline that bites.
 */
export function IpoTimeline({ ipo, today }: { ipo: IpoDetailDto; today: string }) {
  const nextIndex = ipo.timeline.findIndex((e) => !e.done);
  const rows: Row[] = ipo.timeline.flatMap((event, i) => {
    const step: Step = event.done ? 'done' : i === nextIndex ? 'next' : 'ahead';
    const chip = event.done
      ? 'Done'
      : event.date === today
        ? 'Today'
        : event.expected
          ? 'Expected'
          : step === 'next'
            ? 'Next'
            : 'Scheduled';
    const row: Row = {
      key: event.kind,
      label: LABEL[event.kind] ?? event.kind,
      date: event.date,
      when: `${shortDate(event.date)} ${event.date.slice(0, 4)}`,
      step,
      chip,
    };
    if (event.kind !== 'closes' || ipo.upiCutoffAt === null) return [row];
    return [
      row,
      {
        key: 'upi',
        label: 'UPI mandate cut-off',
        date: event.date,
        when: `${shortDate(event.date)}, ${istDayTime(ipo.upiCutoffAt).split(', ')[1] ?? ''}`,
        step,
        chip,
      },
    ];
  });

  return (
    <ModuleCard
      id="timeline"
      title="Timeline"
      note="“Expected” dates follow SEBI's T+3 timetable until the exchange confirms them."
    >
      {rows.length === 0 ? (
        <p className="border-border border-t px-4 py-6 text-center text-muted-foreground text-sm">
          Dates not announced yet.
        </p>
      ) : (
        <ol className="flex flex-col border-border border-t">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 border-border border-b px-4 py-2.5 last:border-0 sm:grid-cols-[1.25rem_minmax(0,1fr)_11rem_6.5rem]"
            >
              <span
                aria-hidden
                className={cn(
                  'size-2.5 rounded-full',
                  row.step === 'done' && 'bg-primary',
                  row.step === 'next' && 'border-[3px] border-warning',
                  row.step === 'ahead' && 'border-2 border-border-strong',
                )}
              />
              <span
                className={cn(
                  'text-sm',
                  row.step === 'done' ? 'text-muted-foreground' : 'font-medium',
                )}
              >
                {row.label}
              </span>
              <span className="flex flex-col items-end sm:contents">
                <span className="figure text-sm sm:text-left">{row.when}</span>
                <span className="sm:text-right">
                  <StateChip
                    tone={row.step === 'done' ? 'open' : row.step === 'next' ? 'waiting' : 'listed'}
                    className="mt-0.5 sm:mt-0"
                  >
                    {row.chip}
                  </StateChip>
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </ModuleCard>
  );
}
