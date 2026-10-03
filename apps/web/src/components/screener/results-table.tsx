'use client';

import { ArrowDownIcon, ArrowUpIcon, TriangleAlertIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Sparkline } from '@/components/market/sparkline';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMetric, stockHref } from '@/lib/screener-format';
import type { MetricDto, ScreenerRowDto } from '@/lib/screener-types';
import { toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * Screener results (plan §8.2): a table with a frozen stock column on wide
 * screens, two-line cards on a phone. Units live in the header; cells show
 * "—" for unknown, never 0. A row opens the stock page.
 */

function Cell({
  metric,
  value,
}: {
  metric: MetricDto | undefined;
  value: ScreenerRowDto['values'][string];
}) {
  const f = formatMetric(metric, value);
  if (f.badge && f.text !== '—') {
    return (
      <Badge
        variant={f.tone === 'bullish' ? 'bullish' : f.tone === 'bearish' ? 'bearish' : 'neutral'}
        size="sm"
      >
        {f.text}
      </Badge>
    );
  }
  return (
    <span className={cn('figure', f.tone !== null && toneText({ tone: f.tone }))}>{f.text}</span>
  );
}

export function ResultsTable({
  rows,
  columns,
  metrics,
  sort,
  onSort,
  selected,
  onToggle,
  hrefSuffix,
  loading,
}: {
  rows: readonly ScreenerRowDto[];
  columns: readonly string[];
  metrics: ReadonlyMap<string, MetricDto>;
  sort: string;
  onSort: (key: string) => void;
  selected: ReadonlySet<string>;
  onToggle: (symbol: string) => void;
  /** Appended to stock links so the stock page can say why it matched. */
  hrefSuffix: string;
  loading: boolean;
}) {
  const [sortKey, sortDir] = sort.split(':');

  return (
    <>
      {/* Wide screens: the table. */}
      <div
        className={cn('hidden overflow-x-auto sm:block', loading && 'opacity-60')}
        aria-busy={loading}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Stocks matching the screen</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 w-9 border-border border-b bg-surface-sunken px-2 py-2.5"
              >
                <span className="sr-only">Select</span>
              </th>
              <th
                scope="col"
                className="sticky left-9 z-20 min-w-48 border-border border-b bg-surface-sunken px-3 py-2.5 text-left font-medium text-muted-foreground text-xs"
              >
                <SortButton
                  label="Stock"
                  active={sortKey === 'symbol'}
                  dir={sortDir}
                  onClick={() => onSort('symbol')}
                />
              </th>
              {columns.map((key) => {
                const m = metrics.get(key);
                return (
                  <th
                    key={key}
                    scope="col"
                    title={m?.description}
                    className="whitespace-nowrap border-border border-b bg-surface-sunken px-3 py-2.5 text-right font-medium text-muted-foreground text-xs"
                  >
                    <SortButton
                      label={m?.label ?? key}
                      active={sortKey === key}
                      dir={sortDir}
                      onClick={() => onSort(key)}
                      align="right"
                    />
                  </th>
                );
              })}
              <th
                scope="col"
                className="border-border border-b bg-surface-sunken px-3 py-2.5 text-right font-medium text-muted-foreground text-xs"
              >
                60 sessions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.instrumentId} className="group">
                <td className="sticky left-0 z-10 border-border border-b bg-surface px-2 py-2 group-hover:bg-accent">
                  <Checkbox
                    aria-label={`Select ${row.symbol}`}
                    checked={selected.has(row.symbol)}
                    onCheckedChange={() => onToggle(row.symbol)}
                  />
                </td>
                <td className="sticky left-9 z-10 max-w-64 border-border border-b bg-surface px-3 py-2 group-hover:bg-accent">
                  <Link
                    href={`${stockHref(row.symbol)}${hrefSuffix}` as Route}
                    className="flex flex-col rounded-sm outline-offset-2 hover:underline"
                  >
                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                      {row.symbol}
                      {row.dataIssue !== null && (
                        <TriangleAlertIcon
                          aria-label="History withheld: possible unrecorded split"
                          className="size-3.5 text-warning"
                        />
                      )}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {row.name}
                      {typeof row.values.industry === 'string' ? ` · ${row.values.industry}` : ''}
                    </span>
                  </Link>
                </td>
                {columns.map((key) => (
                  <td
                    key={key}
                    className="whitespace-nowrap border-border border-b px-3 py-2 text-right group-hover:bg-accent"
                  >
                    <Cell metric={metrics.get(key)} value={row.values[key] ?? null} />
                  </td>
                ))}
                <td className="border-border border-b px-3 py-2 group-hover:bg-accent">
                  <div className="flex justify-end">
                    {row.spark !== null && row.spark.length > 1 && (
                      <Sparkline
                        values={row.spark}
                        width={80}
                        height={24}
                        label={`${row.symbol}, last 60 sessions`}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: cards. */}
      <ul
        className={cn('flex flex-col gap-2 sm:hidden', loading && 'opacity-60')}
        aria-busy={loading}
      >
        {rows.map((row) => (
          <li key={row.instrumentId}>
            <Link
              href={`${stockHref(row.symbol)}${hrefSuffix}` as Route}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 rounded-lg border border-border bg-surface p-3 shadow-subtle"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{row.symbol}</span>
                <span className="truncate text-muted-foreground text-xs">{row.name}</span>
              </span>
              <span className="flex flex-col items-end">
                <Cell metric={metrics.get('close')} value={row.values.close ?? null} />
                <span className="text-xs">
                  <Cell metric={metrics.get('changePct')} value={row.values.changePct ?? null} />
                </span>
              </span>
              <span className="col-span-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {columns
                  .filter((k) => k !== 'close' && k !== 'changePct')
                  .slice(0, 4)
                  .map((k) => (
                    <span key={k} className="inline-flex gap-1">
                      <span className="text-muted-foreground">{metrics.get(k)?.label ?? k}</span>
                      <Cell metric={metrics.get(k)} value={row.values[k] ?? null} />
                    </span>
                  ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  dir: string | undefined;
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label}${active ? (dir === 'asc' ? ', currently ascending' : ', currently descending') : ''}`}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 rounded-sm hover:text-foreground',
        align === 'right' && 'flex-row-reverse',
        active && 'text-foreground',
      )}
    >
      {label}
      {active &&
        (dir === 'asc' ? (
          <ArrowUpIcon aria-hidden className="size-3" />
        ) : (
          <ArrowDownIcon aria-hidden className="size-3" />
        ))}
    </button>
  );
}
