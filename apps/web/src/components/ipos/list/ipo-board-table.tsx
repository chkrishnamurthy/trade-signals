import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';
import { PercentChange } from '@/components/market/numeric';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { quantity, signedPercent } from '@/lib/format';
import { dateRange, gmpText, statusParts, times } from '@/lib/ipo-format';
import type { IpoListItemDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { GmpChip } from '../gmp-chip';
import { StateChip, TONE_ROW, UnofficialTag } from '../ipo-chip';
import { IssueSizeText, PriceBandText, sharePrice } from '../ipo-figures';

const href = (slug: string) => `/ipos/${slug}` as Route;

const dash = <span className="text-subtle-foreground">—</span>;

function Status({ row, today }: { row: IpoListItemDto; today: string }) {
  const s = statusParts(row, today);
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StateChip tone={s.tone}>{s.chip}</StateChip>
      {s.note !== null && <span className="text-2xs text-muted-foreground">{s.note}</span>}
    </span>
  );
}

function MinInvestment({ row }: { row: IpoListItemDto }) {
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

function Subscribed({ row }: { row: IpoListItemDto }) {
  const value = row.subscription?.totalTimes ?? null;
  if (value === null) return dash;
  return (
    <span className={cn('figure', value < 1 ? 'text-muted-foreground' : 'font-medium')}>
      {times(value)}
    </span>
  );
}

function ListingNow({ row }: { row: IpoListItemDto }) {
  if (row.listing === null) return dash;
  return (
    <span className="inline-flex flex-col items-end">
      <PercentChange value={row.listing.listingGainPercent} size="sm" />
      <span className="inline-flex items-baseline gap-1 text-2xs text-muted-foreground">
        now <PercentChange value={row.listing.sinceIssuePercent} size="sm" className="text-2xs" />
      </span>
    </span>
  );
}

/**
 * The GMP in a table whose column header carries the "Unofficial" tag and
 * whose legend names the source: the amount, then its share of the band.
 */
function GmpCell({ row }: { row: IpoListItemDto }) {
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

/** A label above a figure, for the phone row. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-xs">{children}</dd>
    </div>
  );
}

/**
 * Every issue on a board, one row each. A full table from `lg` (the bidding
 * dates and issue size join at `xl`); below that each issue is a compact
 * block with its figures in a grid — no sideways scrolling on a phone.
 */
export function IpoBoardTable({
  rows,
  today,
  gmpEnabled,
}: {
  rows: readonly IpoListItemDto[];
  today: string;
  gmpEnabled: boolean;
}) {
  return (
    <>
      <TableContainer className="hidden lg:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Company</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHead className="hidden w-28 xl:table-cell">Bidding</TableHead>
              <TableHead numeric className="w-28">
                Price band
              </TableHead>
              <TableHead numeric className="w-32">
                Min. investment
              </TableHead>
              <TableHead numeric className="hidden w-28 xl:table-cell">
                Issue size
              </TableHead>
              <TableHead numeric className="w-24">
                Subscribed
              </TableHead>
              {gmpEnabled && (
                <TableHead numeric className="w-32">
                  <span className="inline-flex items-center gap-1">
                    GMP <UnofficialTag className="px-1.5 py-0" />
                  </span>
                </TableHead>
              )}
              <TableHead numeric className="w-28 pr-4">
                Listing · now
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const tone = statusParts(row, today).tone;
              return (
                <TableRow key={row.slug} className={cn(TONE_ROW[tone])}>
                  <TableCell className="pl-4">
                    <span className="flex min-w-0 flex-col">
                      <Link
                        href={href(row.slug)}
                        title={row.companyName}
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {row.companyName}
                      </Link>
                      <span className="figure truncate text-2xs text-muted-foreground">
                        {row.nseSymbol ?? row.exchanges.join(' · ')}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Status row={row} today={today} />
                  </TableCell>
                  <TableCell className="figure hidden text-xs xl:table-cell">
                    {dateRange(row.openDate, row.closeDate)}
                  </TableCell>
                  <TableCell numeric>
                    <PriceBandText band={row.priceBand} />
                  </TableCell>
                  <TableCell numeric>
                    <MinInvestment row={row} />
                  </TableCell>
                  <TableCell numeric className="hidden xl:table-cell">
                    <IssueSizeText item={row} />
                  </TableCell>
                  <TableCell numeric>
                    <Subscribed row={row} />
                  </TableCell>
                  {gmpEnabled && (
                    <TableCell numeric>
                      <GmpCell row={row} />
                    </TableCell>
                  )}
                  <TableCell numeric className="pr-4">
                    <ListingNow row={row} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <ul className="flex flex-col lg:hidden" aria-label="IPOs">
        {rows.map((row) => {
          const s = statusParts(row, today);
          return (
            <li
              key={row.slug}
              className={cn(
                'relative border-border border-b px-4 py-3 last:border-0 hover:bg-accent/40',
                TONE_ROW[s.tone],
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={href(row.slug)}
                    className="font-medium text-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
                  >
                    {row.companyName}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {[row.nseSymbol, dateRange(row.openDate, row.closeDate)]
                      .filter((x) => x !== null)
                      .join(' · ')}
                  </p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <StateChip tone={s.tone}>{s.chip}</StateChip>
                  {s.note !== null && (
                    <span className="text-2xs text-muted-foreground">{s.note}</span>
                  )}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-5">
                <Fact label="Price band">
                  <PriceBandText band={row.priceBand} />
                </Fact>
                <Fact label="Min. investment">
                  <span className="figure">{sharePrice(row.minInvestmentPaise)}</span>
                </Fact>
                <Fact label={row.listing === null ? 'Subscribed' : 'Listing day'}>
                  {row.listing === null ? (
                    <Subscribed row={row} />
                  ) : (
                    <PercentChange value={row.listing.listingGainPercent} size="sm" />
                  )}
                </Fact>
                <div className="hidden sm:block">
                  <Fact label="Issue size">
                    <IssueSizeText item={row} />
                  </Fact>
                </div>
                <div className="hidden sm:block">
                  <Fact label={row.listing === null ? 'Lot' : 'Now'}>
                    {row.listing === null ? (
                      <span className="figure">
                        {row.lotSize === null ? '—' : `${quantity(row.lotSize)} shares`}
                      </span>
                    ) : (
                      <PercentChange value={row.listing.sinceIssuePercent} size="sm" />
                    )}
                  </Fact>
                </div>
              </dl>
              {gmpEnabled && row.gmp !== null && row.gmp.latestPaise !== null && (
                <div className="relative z-10 mt-2 w-fit">
                  <GmpChip gmp={row.gmp} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
