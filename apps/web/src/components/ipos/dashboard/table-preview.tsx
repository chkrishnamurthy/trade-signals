import type { IpoStatus } from '@equitywise/shared';
import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { PercentChange } from '@/components/market/numeric';
import { Card } from '@/components/ui/card';
import { dateRange, statusParts, times } from '@/lib/ipo-format';
import { tableHref } from '@/lib/ipo-routes';
import type { IpoDashboardDto } from '@/lib/ipo-types';
import { CompanyCell, Demand, dash, GmpCell, MinInvestment, Status } from '../ipo-cells';
import { TONE_ROW, UnofficialTag } from '../ipo-chip';
import { PriceBandText } from '../ipo-figures';
import { ModuleTable } from '../module-card';

const PILLS: readonly { readonly id: IpoStatus | null; readonly label: string }[] = [
  { id: null, label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closed', label: 'Allotment & listing' },
  { id: 'listed', label: 'Listed' },
];

/**
 * The master table's first rows, in its own default order, with its status
 * filters as links into it. The full table keeps the sorting, columns,
 * density and CSV; this only shows that it is there and what it holds.
 */
export function TablePreview({ data }: { data: IpoDashboardDto }) {
  const counts = data.yearCounts;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const mixed = data.board === 'all';
  const gmpOn = data.gmpPolicy.enabled;
  return (
    <Card aria-labelledby="ipo-table" className="overflow-hidden">
      <header className="flex flex-col gap-3 px-4 pt-3.5 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h2 id="ipo-table" className="font-semibold text-sm tracking-tight">
              All IPOs <span className="font-normal text-muted-foreground">· the master table</span>
            </h2>
            <p className="text-muted-foreground text-xs">
              Every {data.yearStats.year} issue with its schedule, price, demand and listing. Sort,
              choose columns and download in the full table.
            </p>
          </div>
          <Link
            href={tableHref(data.board)}
            className="inline-flex min-h-11 items-center gap-1 font-medium text-primary text-sm underline-offset-4 hover:underline sm:min-h-0 sm:text-xs"
          >
            Open the master table
            <ArrowRightIcon aria-hidden className="size-3" />
          </Link>
        </div>
        <nav aria-label="Open the table at a status" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex w-max gap-1.5">
            {PILLS.map((p) => (
              <li key={p.id ?? 'all'}>
                <Link
                  href={tableHref(data.board, { status: p.id })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm transition-colors hover:bg-accent sm:h-8"
                >
                  {p.label}
                  <span className="figure text-muted-foreground text-xs">
                    {p.id === null ? total : counts[p.id]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <ModuleTable
        caption={`The first rows of the master table, ${data.yearStats.year}`}
        rows={data.preview}
        rowKey={(r) => r.slug}
        rowTone={(r) => {
          const tone = statusParts(r, data.today).tone;
          return TONE_ROW[tone] === undefined ? null : tone;
        }}
        empty="No issue this year yet."
        columns={[
          {
            id: 'company',
            header: 'Company',
            cell: (r) => <CompanyCell row={r} showBoard={mixed} />,
          },
          {
            id: 'status',
            header: 'Status',
            width: 'w-36',
            cell: (r) => <Status row={r} today={data.today} />,
          },
          {
            id: 'bidding',
            header: 'Bidding',
            width: 'w-32',
            cell: (r) => (
              <span className="figure text-xs">{dateRange(r.openDate, r.closeDate)}</span>
            ),
          },
          {
            id: 'band',
            header: 'Band',
            width: 'w-32',
            align: 'end',
            cell: (r) => <PriceBandText band={r.priceBand} />,
          },
          {
            id: 'min',
            header: 'Min. investment',
            width: 'w-36',
            align: 'end',
            cell: (r) => <MinInvestment row={r} />,
          },
          {
            id: 'demand',
            header: 'Demand',
            width: 'w-28',
            align: 'end',
            cell: (r) => <Demand row={r} />,
          },
          ...(gmpOn
            ? [
                {
                  id: 'gmp',
                  header: <UnofficialTag className="px-1.5 py-0" />,
                  width: 'w-28',
                  align: 'end' as const,
                  cell: (r: (typeof data.preview)[number]) => <GmpCell row={r} />,
                },
              ]
            : []),
          {
            id: 'day1',
            header: 'Day 1',
            width: 'w-24',
            align: 'end',
            cell: (r) =>
              r.listing === null ? (
                dash
              ) : (
                <PercentChange value={r.listing.listingGainPercent} size="sm" />
              ),
          },
        ]}
        mobile={(r) => {
          const s = statusParts(r, data.today);
          return {
            title: r.companyName,
            sub: `${s.chip}${s.note === null ? '' : ` · ${s.note}`}`,
            value:
              r.listing === null ? (
                <span className="figure">{times(r.subscription?.totalTimes ?? null)}</span>
              ) : (
                <PercentChange value={r.listing.listingGainPercent} size="sm" />
              ),
            valueSub: r.listing === null ? 'demand' : 'day 1',
            href: `/ipos/${r.slug}`,
          };
        }}
      />
      <footer className="flex flex-col gap-1 border-border border-t px-4 py-2.5 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {data.preview.length} of {total} · open issues first
        </span>
        <span>* Expected, from SEBI&apos;s T+3 timetable · GMP: unofficial</span>
      </footer>
    </Card>
  );
}
