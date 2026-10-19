import Link from 'next/link';
import { quantity, signedPercent } from '@/lib/format';
import { gmpText, statusParts, times } from '@/lib/ipo-format';
import { DEMAND_BAR_ONE_TIMES, demandBarPercent } from '@/lib/ipo-list';
import { issueHref } from '@/lib/ipo-routes';
import type { IpoListItemDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { StateChip } from './ipo-chip';
import { sharePrice } from './ipo-figures';
import { initials } from './list/ipo-list-columns';

/**
 * The cells an issue shows wherever it appears — the master table, the
 * Overview's cards and its preview of the table — so a figure reads the same
 * in every place.
 */

export const dash = <span className="text-subtle-foreground">—</span>;

/** The state chip and, under it, the next date. */
export function Status({ row, today }: { row: IpoListItemDto; today: string }) {
  const s = statusParts(row, today);
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StateChip tone={s.tone} dot>
        {s.chip}
      </StateChip>
      {s.note !== null && <span className="text-2xs text-muted-foreground">{s.note}</span>}
    </span>
  );
}

export function IssuerMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-md bg-muted font-semibold text-2xs text-muted-foreground"
    >
      {initials(name)}
    </span>
  );
}

export function MinInvestment({ row }: { row: IpoListItemDto }) {
  if (row.minInvestmentPaise === null) return dash;
  return (
    <span className="inline-flex flex-col items-end">
      <span className="figure">{sharePrice(row.minInvestmentPaise)}</span>
      {row.lotSize !== null && (
        <span className="text-2xs text-muted-foreground">
          {row.minApplicationLots > 1
            ? `${row.minApplicationLots} lots of ${quantity(row.lotSize)}`
            : `${quantity(row.lotSize)} shares a lot`}
        </span>
      )}
    </span>
  );
}

/**
 * Demand as a figure over a bar. The bar is logarithmic (0.1× to 100×) with a
 * tick at 1×, so "fully subscribed" reads at a glance without flattening 2×
 * beside 50×. The figure carries the meaning; the bar is decoration.
 */
export function Demand({ row }: { row: IpoListItemDto }) {
  const value = row.subscription?.totalTimes ?? null;
  if (value === null) return dash;
  const under = value < 1;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className={cn('figure', under ? 'text-muted-foreground' : 'font-semibold')}>
        {times(value)}
      </span>
      <span aria-hidden className="relative block h-1.5 w-20 rounded-full bg-muted">
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            under ? 'bg-muted-foreground/50' : 'bg-bullish',
          )}
          style={{ width: `${demandBarPercent(value).toFixed(2)}%` }}
        />
        <span
          className="-inset-y-0.5 absolute w-px bg-foreground/45"
          style={{ left: `${DEMAND_BAR_ONE_TIMES}%` }}
        />
      </span>
    </span>
  );
}

export function Retail({ row }: { row: IpoListItemDto }) {
  const value = row.subscription?.retailTimes ?? null;
  return value === null ? (
    dash
  ) : (
    <span className="figure text-muted-foreground">{times(value)}</span>
  );
}

/** The amount, then its share of the band; the column header carries "Unofficial". */
export function GmpCell({ row }: { row: IpoListItemDto }) {
  if (row.gmp === null || row.gmp.latestPaise === null) return dash;
  return (
    <span
      className={cn('inline-flex flex-col items-end', row.gmp.stale && 'text-subtle-foreground')}
      title={`Reported by ${row.gmp.sourceName}${row.gmp.stale ? ' — more than a day and a half ago' : ''}`}
    >
      <span className="figure">
        {gmpText({ latestPaise: row.gmp.latestPaise, percentOfUpperBand: null })}
      </span>
      <span className="figure text-2xs text-muted-foreground">
        {signedPercent(row.gmp.percentOfUpperBand)}
        {row.gmp.stale ? ' · stale' : ''}
      </span>
    </span>
  );
}

/** A company's name as a link to its issue page, with its symbol and, when boards are mixed, an SME mark. */
export function CompanyCell({
  row,
  showBoard = false,
  className,
}: {
  row: IpoListItemDto;
  showBoard?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <IssuerMark name={row.companyName} />
      <span className="flex min-w-0 flex-col">
        <Link
          href={issueHref(row.slug)}
          title={row.companyName}
          className={cn('truncate font-medium underline-offset-4 hover:underline', className)}
        >
          {row.companyName}
        </Link>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="figure truncate text-2xs text-muted-foreground">
            {row.nseSymbol ?? row.exchanges.join(' · ')}
          </span>
          {showBoard && row.board === 'sme' && <SmeMark />}
        </span>
      </span>
    </span>
  );
}

/** "SME" beside an issue when the page mixes both boards. */
export function SmeMark({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm px-1 font-medium text-[0.625rem] text-muted-foreground leading-4 ring-1 ring-border ring-inset',
        className,
      )}
    >
      SME
    </span>
  );
}
