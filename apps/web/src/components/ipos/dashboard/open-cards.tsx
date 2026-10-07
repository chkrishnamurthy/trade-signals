import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { quantity } from '@/lib/format';
import { dayLabel, gmpText, istDayTime, shortDate, times } from '@/lib/ipo-format';
import { DEMAND_BAR_ONE_TIMES, demandBarPercent } from '@/lib/ipo-list';
import { issueHref, tableHref } from '@/lib/ipo-routes';
import type { IpoDashboardDto, IpoListItemDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { IssuerMark, SmeMark } from '../ipo-cells';
import { StateChip, UnofficialTag } from '../ipo-chip';
import { bandText, IssueSizeText, sharePrice } from '../ipo-figures';

/** How many open issues get a card; the rest are a click away in the table. */
const CARDS_SHOWN = 6;

type Step = 'done' | 'now' | 'ahead';

/** Opened, closes, lists — the three dates an open issue runs on. */
function Schedule({ row, today }: { row: IpoListItemDto; today: string }) {
  const listing = row.listingDate ?? row.expectedListingDate;
  const steps: { label: string; date: string | null; star: boolean; step: Step }[] = [
    { label: 'Opened', date: row.openDate, star: false, step: 'done' },
    { label: 'Closes', date: row.closeDate, star: false, step: 'now' },
    {
      label: 'Lists',
      date: listing,
      star: row.listingDate === null && listing !== null,
      step: 'ahead',
    },
  ];
  return (
    <ol aria-label="Schedule" className="grid grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex flex-col gap-0.5 pt-4">
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                'absolute top-[0.3rem] right-0 left-0 h-0.5',
                s.step === 'done' ? 'bg-bullish' : 'bg-border',
              )}
            />
          )}
          <span
            aria-hidden
            className={cn(
              'absolute top-0 left-0 size-2.5 rounded-full border-2',
              s.step === 'done' && 'border-bullish bg-bullish',
              s.step === 'now' && 'border-bullish bg-surface ring-3 ring-bullish-soft',
              s.step === 'ahead' && 'border-border-strong bg-surface',
            )}
          />
          <span className="text-2xs text-muted-foreground">{s.label}</span>
          <span
            className={cn(
              'figure text-xs',
              s.step === 'now' && 'font-semibold text-bullish-strong',
              s.date === null && 'text-subtle-foreground',
            )}
          >
            {s.date === null
              ? '—'
              : s.step === 'now'
                ? dayLabel(s.date, today)
                : shortDate(s.date).slice(4)}
            {s.star && '*'}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Demand so far as a figure over the log-scale bar, with retail beside it. */
function DemandLine({ row }: { row: IpoListItemDto }) {
  const total = row.subscription?.totalTimes ?? null;
  const retail = row.subscription?.retailTimes ?? null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        <span className="w-14 text-muted-foreground text-xs">Demand</span>
        <span aria-hidden className="relative block h-1.5 flex-1 rounded-full bg-muted">
          {total !== null && (
            <span
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                total < 1 ? 'bg-muted-foreground/50' : 'bg-bullish',
              )}
              style={{ width: `${demandBarPercent(total).toFixed(2)}%` }}
            />
          )}
          <span
            className="-inset-y-0.5 absolute w-px bg-foreground/45"
            style={{ left: `${DEMAND_BAR_ONE_TIMES}%` }}
          />
        </span>
        <span
          className={cn(
            'figure w-16 text-right text-sm',
            total === null || total < 1 ? 'text-muted-foreground' : 'font-semibold',
          )}
        >
          {times(total)}
        </span>
      </div>
      <span className="text-2xs text-muted-foreground">
        {total === null
          ? 'No bids reported yet'
          : `${retail === null ? '' : `Retail ${times(retail)} · `}as of ${istDayTime(row.subscription?.asOf ?? null)}`}
      </span>
    </div>
  );
}

function OpenCard({
  row,
  today,
  mixed,
  gmpOn,
}: {
  row: IpoListItemDto;
  today: string;
  mixed: boolean;
  gmpOn: boolean;
}) {
  const closesToday = row.closeDate === today;
  const gmp = gmpOn && row.gmp !== null && row.gmp.latestPaise !== null ? row.gmp : null;
  return (
    <Card className="relative flex flex-col gap-3.5 border-bullish-line p-4 transition-colors hover:bg-accent/30">
      <div className="flex items-start gap-2.5">
        <IssuerMark name={row.companyName} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={issueHref(row.slug)}
            className="font-semibold text-sm leading-snug after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
          >
            {row.companyName}
          </Link>
          <span className="flex items-center gap-1.5">
            <span className="figure truncate text-2xs text-muted-foreground">
              {row.nseSymbol ?? row.exchanges.join(' · ')}
            </span>
            {mixed && row.board === 'sme' && <SmeMark />}
          </span>
        </div>
        <StateChip tone="open" dot className={cn(closesToday && 'font-semibold')}>
          {row.closeDate === null ? 'Open' : `Closes ${dayLabel(row.closeDate, today)}`}
        </StateChip>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <dt className="text-2xs text-muted-foreground">Min. investment</dt>
          <dd className="figure font-semibold text-sm">{sharePrice(row.minInvestmentPaise)}</dd>
          {row.lotSize !== null && (
            <dd className="truncate text-2xs text-muted-foreground">
              {row.minApplicationLots > 1
                ? `${row.minApplicationLots} lots of ${quantity(row.lotSize)}`
                : `${quantity(row.lotSize)} shares`}
            </dd>
          )}
        </div>
        <div className="min-w-0">
          <dt className="text-2xs text-muted-foreground">Price band</dt>
          <dd className="figure truncate text-sm">{bandText(row.priceBand)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-2xs text-muted-foreground">Issue size</dt>
          <dd className="truncate text-sm">
            <IssueSizeText item={row} />
          </dd>
        </div>
      </dl>

      <DemandLine row={row} />
      <Schedule row={row} today={today} />

      {gmp !== null && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-md bg-warning-soft/60 px-2.5 py-1.5 text-xs">
          <UnofficialTag />
          <span className="figure">GMP {gmpText(gmp)}</span>
          <span className="text-muted-foreground">· {gmp.sourceName}</span>
        </p>
      )}

      <span className="mt-auto inline-flex items-center gap-1 font-medium text-primary-strong text-sm">
        View issue
        <ArrowRightIcon aria-hidden className="size-3.5" />
      </span>
    </Card>
  );
}

/**
 * The issues open for bids, one card each: when bidding closes, what the
 * smallest application costs, demand so far and the dates ahead. The card
 * opens the issue; nothing on it applies for or bids on anything.
 */
export function OpenCards({ data }: { data: IpoDashboardDto }) {
  const shown = data.open.slice(0, CARDS_SHOWN);
  const more = data.open.length - shown.length;
  const expected = shown.some((r) => r.listingDate === null && r.expectedListingDate !== null);
  return (
    <section id="ipo-open" aria-labelledby="ipo-open-title" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2
          id="ipo-open-title"
          className="flex items-center gap-2 font-semibold text-sm tracking-tight"
        >
          <StateChip tone="open" dot>
            Open for bids
          </StateChip>
          <span className="figure text-muted-foreground text-xs">{data.open.length}</span>
        </h2>
        {data.open.length > 0 && (
          <Link
            href={tableHref(data.board, { status: 'open' })}
            className="inline-flex min-h-11 items-center font-medium text-primary-strong text-sm underline-offset-4 hover:underline sm:min-h-0 sm:text-xs"
          >
            {more > 0 ? `All ${data.open.length} in the table →` : 'Compare in the table →'}
          </Link>
        )}
      </div>
      {shown.length === 0 ? (
        <Card className="px-4 py-6 text-center text-muted-foreground text-sm">
          No issue is open for bids today.
          {data.upcoming[0]?.openDate != null &&
            ` ${data.upcoming[0].companyName} opens ${shortDate(data.upcoming[0].openDate)}.`}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((row) => (
            <OpenCard
              key={row.slug}
              row={row}
              today={data.today}
              mixed={data.board === 'all'}
              gmpOn={data.gmpPolicy.enabled}
            />
          ))}
        </div>
      )}
      {expected && (
        <p className="text-2xs text-muted-foreground">
          * Expected, from SEBI&apos;s T+3 timetable · demand bar: log scale, the tick is fully
          subscribed (1×)
        </p>
      )}
    </section>
  );
}
