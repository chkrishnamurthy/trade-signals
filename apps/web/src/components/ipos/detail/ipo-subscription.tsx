'use client';

import { useState } from 'react';
import { quantity } from '@/lib/format';
import { istDayTime, scopeLabel, shortDate, times } from '@/lib/ipo-format';
import type { IpoDetailDto, SubscriptionRowDto, SubscriptionTableDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { ModuleCard } from '../module-card';

const LABEL: Readonly<Record<SubscriptionRowDto['category'], string>> = {
  qib: 'Qualified institutional buyers',
  nii: 'Non-institutional investors',
  nii_big: 'Above ₹10 lakh (bNII)',
  nii_small: '₹2–10 lakh (sNII)',
  retail: 'Retail individual investors',
  employee: 'Employees',
  shareholder: 'Shareholders',
  policyholder: 'Policyholders',
  other: 'Other',
  total: 'Total',
};

const label = (row: SubscriptionRowDto) =>
  row.category === 'other' ? row.label : LABEL[row.category];

/**
 * Times subscribed as a bar. The scale runs to the table's largest figure (at
 * least 2×) so every row stays comparable, and a hairline marks 1× — as many
 * bids as shares offered.
 */
function Bar({ times: value, max }: { times: number | null; max: number }) {
  const width = value === null ? 0 : Math.min(value, max) / max;
  return (
    <span
      aria-hidden
      className="relative block h-2 w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-border ring-inset"
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full',
          value !== null && value >= 1 ? 'bg-primary/70' : 'bg-neutral/60',
        )}
        style={{ width: `${(width * 100).toFixed(1)}%` }}
      />
      <span
        className="absolute inset-y-0 w-px bg-foreground/40"
        style={{ left: `${((1 / max) * 100).toFixed(1)}%` }}
      />
    </span>
  );
}

function Rows({ table }: { table: SubscriptionTableDto }) {
  const max = Math.max(2, ...table.rows.map((r) => r.times ?? 0));
  return (
    <>
      <table className="hidden w-full table-fixed border-collapse text-sm sm:table">
        <caption className="sr-only">Subscription by investor category</caption>
        <thead className="bg-surface-sunken text-muted-foreground text-xs">
          <tr className="border-border border-y">
            <th scope="col" className="h-8 pl-4 text-left font-normal">
              Category
            </th>
            <th scope="col" className="hidden w-28 px-2 text-right font-normal md:table-cell">
              Shares offered
            </th>
            <th scope="col" className="hidden w-28 px-2 text-right font-normal md:table-cell">
              Shares bid
            </th>
            <th scope="col" className="w-40 px-2 font-normal">
              <span className="sr-only">Bar</span>
            </th>
            <th scope="col" className="w-20 pr-4 pl-2 text-right font-normal">
              Times
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr
              key={row.label}
              className={cn(
                'border-border border-b last:border-0',
                row.category === 'total' && 'bg-surface-sunken font-semibold',
              )}
            >
              <td
                className={cn(
                  'h-10 truncate py-1.5 pl-4',
                  row.category.startsWith('nii_') && 'pl-8 text-muted-foreground',
                )}
                title={row.label}
              >
                {label(row)}
              </td>
              <td className="figure hidden px-2 text-right text-muted-foreground md:table-cell">
                {quantity(row.sharesOffered)}
              </td>
              <td className="figure hidden px-2 text-right text-muted-foreground md:table-cell">
                {quantity(row.sharesBid)}
              </td>
              <td className="px-2">
                <Bar times={row.times} max={max} />
              </td>
              <td className="figure pr-4 pl-2 text-right font-medium">{times(row.times)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul
        className="border-border border-t sm:hidden"
        aria-label="Subscription by investor category"
      >
        {table.rows.map((row) => (
          <li
            key={row.label}
            className={cn(
              'flex flex-col gap-1.5 border-border border-b px-4 py-2.5 last:border-0',
              row.category === 'total' && 'bg-surface-sunken',
            )}
          >
            <span className="flex justify-between gap-3 text-sm">
              <span
                className={cn(
                  row.category.startsWith('nii_') && 'pl-3 text-muted-foreground',
                  row.category === 'total' && 'font-semibold',
                )}
              >
                {label(row)}
              </span>
              <span className="figure font-medium">{times(row.times)}</span>
            </span>
            <Bar times={row.times} max={max} />
            <span className="figure text-muted-foreground text-xs">
              {quantity(row.sharesBid)} bid of {quantity(row.sharesOffered)} offered
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** An instant's IST calendar day. */
const istDay = (iso: string) =>
  new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Demand by investor category: whose bids are counted, as of when, and — when
 * both are published — a switch between all bids and NSE's alone. Demand so
 * far, not a forecast of anything.
 */
export function IpoSubscription({ ipo }: { ipo: IpoDetailDto }) {
  const [nseOnly, setNseOnly] = useState(false);
  const table =
    nseOnly && ipo.subscriptionNseOnly !== null ? ipo.subscriptionNseOnly : ipo.subscriptionTable;
  const canSwitch = ipo.subscriptionTable !== null && ipo.subscriptionNseOnly !== null;
  return (
    <ModuleCard
      id="subscription"
      title="Subscription by category"
      note={
        table === null
          ? 'No bids published yet.'
          : `${nseOnly ? 'NSE bids only' : canSwitch ? 'All bids' : scopeLabel(table.scope, ipo.exchanges)}, as of ${istDayTime(table.asOf)} IST${table.asOfBasis === 'fetched' ? ' (time collected)' : ''}. The line marks 1×: as many bids as shares.`
      }
      aside={
        canSwitch ? (
          <fieldset className="m-0 inline-flex gap-0.5 rounded-md border border-border p-0.5">
            <legend className="sr-only">Whose bids</legend>
            {[
              {
                on: !nseOnly,
                label: ipo.exchanges.length > 1 ? 'NSE + BSE' : 'All bids',
                value: false,
              },
              { on: nseOnly, label: 'NSE only', value: true },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={o.on}
                onClick={() => setNseOnly(o.value)}
                className={cn(
                  'h-8 rounded-sm px-2.5 font-medium text-xs transition-colors sm:h-7',
                  o.on
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
              </button>
            ))}
          </fieldset>
        ) : undefined
      }
      footer={
        table === null
          ? undefined
          : nseOnly
            ? 'NSE-only bids leave out bids placed through BSE, so they read lower.'
            : 'Updated while bidding is open; the last reading after close is the final figure.'
      }
    >
      {table === null ? (
        <p className="border-border border-t px-4 py-6 text-center text-muted-foreground text-sm">
          The exchange has not published bids for this issue yet.
        </p>
      ) : (
        <Rows table={table} />
      )}
      {!nseOnly && ipo.subscriptionHistory.length > 1 && (
        <div className="border-border border-t">
          <p className="px-4 pt-3 pb-2 font-medium text-xs">
            Day by day{' '}
            <span className="font-normal text-muted-foreground">· last reading each day</span>
          </p>
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">Subscription day by day</caption>
            <thead className="bg-surface-sunken text-muted-foreground text-xs">
              <tr className="border-border border-y">
                <th scope="col" className="h-8 pl-4 text-left font-normal">
                  Day
                </th>
                <th scope="col" className="px-2 text-right font-normal">
                  QIB
                </th>
                <th scope="col" className="hidden px-2 text-right font-normal sm:table-cell">
                  NII
                </th>
                <th scope="col" className="px-2 text-right font-normal">
                  Retail
                </th>
                <th scope="col" className="pr-4 pl-2 text-right font-normal">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {ipo.subscriptionHistory.map((p) => (
                <tr key={p.asOf} className="border-border border-b last:border-0">
                  <td className="h-9 pl-4">{shortDate(istDay(p.asOf))}</td>
                  <td className="figure px-2 text-right">{times(p.qibTimes)}</td>
                  <td className="figure hidden px-2 text-right sm:table-cell">
                    {times(p.niiTimes)}
                  </td>
                  <td className="figure px-2 text-right">{times(p.retailTimes)}</td>
                  <td className="figure pr-4 pl-2 text-right font-medium">{times(p.totalTimes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModuleCard>
  );
}
