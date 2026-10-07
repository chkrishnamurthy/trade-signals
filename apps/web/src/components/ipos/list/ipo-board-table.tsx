'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  Columns3Icon,
  DownloadIcon,
  Rows3Icon,
  Rows4Icon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { PercentChange } from '@/components/market/numeric';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type IpoTone, statusParts, times } from '@/lib/ipo-format';
import { type IpoListSort, type IpoListSortKey, SORT_LABEL } from '@/lib/ipo-list';
import { issueHref } from '@/lib/ipo-routes';
import type { IpoListItemDto } from '@/lib/ipo-types';
import { cn } from '@/lib/utils';
import { GmpChip } from '../gmp-chip';
import {
  CompanyCell,
  Demand,
  dash,
  GmpCell,
  IssuerMark,
  MinInvestment,
  Retail,
  SmeMark,
  Status,
} from '../ipo-cells';
import { StateChip, TONE_ROW, UnofficialTag } from '../ipo-chip';
import { IssueSizeText, PriceBandText, sharePrice } from '../ipo-figures';
import {
  biddingText,
  COLUMNS,
  type ColumnDef,
  type ColumnGroupId,
  type ColumnId,
  GROUP_LABEL,
  ipoListCsv,
  listingDay,
  MENU_LABEL,
} from './ipo-list-columns';

type Density = 'comfortable' | 'compact';

const HIDDEN_KEY = 'ew:ipo-list:hidden-columns';
const DENSITY_KEY = 'ew:ipo-list:density';

/**
 * A frozen company column needs its own opaque fill, or the columns scrolling
 * under it show through; it follows its row's tint and hover.
 */
const PINNED_FILL: Readonly<Partial<Record<IpoTone, string>>> = {
  open: 'bg-[color-mix(in_srgb,var(--bullish-soft)_45%,var(--surface))]',
  waiting: 'bg-[color-mix(in_srgb,var(--warning-soft)_50%,var(--surface))]',
};
const PINNED_CELL =
  'sticky left-0 z-10 [tr:hover_&]:bg-[color-mix(in_srgb,var(--accent)_60%,var(--surface))]';

/** Reads a per-viewer preference; storage can be missing or blocked. */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private window or blocked storage: the preference lasts this visit only.
  }
}

function Cell({
  column,
  row,
  today,
  showBoard,
}: {
  column: ColumnId;
  row: IpoListItemDto;
  today: string;
  showBoard: boolean;
}) {
  switch (column) {
    case 'company':
      return <CompanyCell row={row} showBoard={showBoard} className="max-w-52" />;
    case 'status':
      return <Status row={row} today={today} />;
    case 'bidding':
      return <span className="figure text-xs">{biddingText(row)}</span>;
    case 'lists':
      return <span className="figure text-xs">{listingDay(row)}</span>;
    case 'band':
      return <PriceBandText band={row.priceBand} />;
    case 'min':
      return <MinInvestment row={row} />;
    case 'size':
      return <IssueSizeText item={row} />;
    case 'demand':
      return <Demand row={row} />;
    case 'retail':
      return <Retail row={row} />;
    case 'gmp':
      return <GmpCell row={row} />;
    case 'day1':
      return row.listing === null ? (
        dash
      ) : (
        <PercentChange value={row.listing.listingGainPercent} size="sm" className="font-medium" />
      );
    case 'now':
      return row.listing === null ? (
        dash
      ) : (
        <PercentChange value={row.listing.sinceIssuePercent} size="sm" />
      );
  }
}

function SortHeader({
  column,
  sort,
  hrefFor,
}: {
  column: ColumnDef;
  sort: IpoListSort;
  hrefFor: (key: IpoListSortKey) => string;
}) {
  if (column.sort === null) return <>{column.label}</>;
  const active = sort.key === column.sort;
  const Icon = !active ? ChevronsUpDownIcon : sort.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Link
      href={hrefFor(column.sort) as Route}
      scroll={false}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring',
        active && 'text-foreground',
        column.numeric && 'flex-row-reverse',
      )}
    >
      {column.label}
      <Icon aria-hidden className={cn('size-3', !active && 'opacity-40')} />
    </Link>
  );
}

function ColumnsMenu({
  hidden,
  onChange,
  gmpEnabled,
}: {
  hidden: ReadonlySet<ColumnId>;
  onChange: (next: ReadonlySet<ColumnId>) => void;
  gmpEnabled: boolean;
}) {
  const hideable = COLUMNS.filter((c) => c.hideable && (gmpEnabled || c.id !== 'gmp'));
  const shown = hideable.filter((c) => !hidden.has(c.id)).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="default">
          <Columns3Icon aria-hidden />
          Columns
          <span className="figure text-muted-foreground text-xs">
            {shown}/{hideable.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-2 font-medium text-muted-foreground text-xs">Show columns</p>
        <ul className="flex flex-col">
          {hideable.map((c) => {
            const id = `ipo-col-${c.id}`;
            return (
              <li key={c.id}>
                <label
                  htmlFor={id}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 hover:bg-accent"
                >
                  <Checkbox
                    id={id}
                    checked={!hidden.has(c.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(hidden);
                      if (checked === true) next.delete(c.id);
                      else next.add(c.id);
                      onChange(next);
                    }}
                  />
                  <span className="text-sm">{MENU_LABEL[c.id]}</span>
                  <span className="ml-auto whitespace-nowrap text-2xs text-muted-foreground">
                    {GROUP_LABEL[c.group]}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {hidden.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => onChange(new Set())}
          >
            Show all
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Groups of adjacent visible columns, for the header's top row. */
function groupsOf(columns: readonly ColumnDef[]): { id: ColumnGroupId; span: number }[] {
  const out: { id: ColumnGroupId; span: number }[] = [];
  for (const c of columns) {
    const last = out.at(-1);
    if (last !== undefined && last.id === c.group) last.span += 1;
    else out.push({ id: c.group, span: 1 });
  }
  return out;
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
 * Every issue on a board, one row each — the master table. From `lg` it is a
 * table with grouped columns (schedule, price, demand, grey market, listing),
 * a frozen company column, server-side sorting by header link, a Columns menu,
 * two row densities and a CSV of the rows on screen; the column and density
 * choices stay in this browser. Below `lg` each issue is a compact block and
 * the order is a menu — no sideways scrolling on a phone.
 */
export function IpoBoardTable({
  rows,
  today,
  gmpEnabled,
  sort,
  sortHrefs,
  defaultSortHrefs,
  rangeLabel,
  csvName,
  showBoard = false,
}: {
  rows: readonly IpoListItemDto[];
  today: string;
  gmpEnabled: boolean;
  sort: IpoListSort;
  /** Per key: the address a header click goes to (the active one flips direction). */
  sortHrefs: Readonly<Record<IpoListSortKey, string>>;
  /** Per key: that order in its own first direction, for the phone's menu. */
  defaultSortHrefs: Readonly<Record<IpoListSortKey, string>>;
  rangeLabel: string;
  csvName: string;
  /** Both boards in one table: SME issues carry a mark. */
  showBoard?: boolean | undefined;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<ReadonlySet<ColumnId>>(new Set());
  const [density, setDensity] = useState<Density>('comfortable');

  useEffect(() => {
    const storedHidden = readStored(HIDDEN_KEY);
    if (storedHidden !== null) {
      try {
        const parsed: unknown = JSON.parse(storedHidden);
        if (Array.isArray(parsed)) {
          const ids = new Set<ColumnId>();
          for (const c of COLUMNS) if (c.hideable && parsed.includes(c.id)) ids.add(c.id);
          setHidden(ids);
        }
      } catch {
        // A malformed preference is ignored; every column shows.
      }
    }
    if (readStored(DENSITY_KEY) === 'compact') setDensity('compact');
  }, []);

  const updateHidden = (next: ReadonlySet<ColumnId>) => {
    setHidden(next);
    writeStored(HIDDEN_KEY, JSON.stringify([...next]));
  };
  const toggleDensity = () => {
    const next: Density = density === 'compact' ? 'comfortable' : 'compact';
    setDensity(next);
    writeStored(DENSITY_KEY, next);
  };

  const visible = useMemo(
    () => COLUMNS.filter((c) => !hidden.has(c.id) && (gmpEnabled || c.id !== 'gmp')),
    [hidden, gmpEnabled],
  );
  const groups = groupsOf(visible);
  const groupStarts = new Set(
    visible.filter((c, i) => i > 0 && visible[i - 1]?.group !== c.group).map((c) => c.id),
  );
  const sortOptions = (Object.keys(SORT_LABEL) as IpoListSortKey[]).filter(
    (k) => gmpEnabled || k !== 'gmp',
  );

  const downloadCsv = () => {
    const csv = ipoListCsv(
      rows,
      visible.map((c) => c.id),
      today,
    );
    // The BOM makes spreadsheet apps read the ₹ in the headers as UTF-8.
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = csvName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-3 py-2 sm:px-4">
        <p className="text-muted-foreground text-xs">
          {rangeLabel} · sorted by {SORT_LABEL[sort.key].toLowerCase()}{' '}
          <span aria-hidden>{sort.dir === 'asc' ? '↑' : '↓'}</span>
          <span className="sr-only">{sort.dir === 'asc' ? 'ascending' : 'descending'}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-muted-foreground text-xs lg:hidden">
            Sort
            <select
              value={sort.key}
              onChange={(event) => {
                const key = event.target.value as IpoListSortKey;
                router.push(defaultSortHrefs[key] as Route, { scroll: false });
              }}
              className="h-10 rounded-md border border-input bg-surface px-2 text-foreground text-sm shadow-subtle focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
            >
              {sortOptions.map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="hidden items-center gap-2 lg:flex">
            <Button
              variant="outline"
              onClick={toggleDensity}
              aria-pressed={density === 'compact'}
              title="Row spacing"
            >
              {density === 'compact' ? <Rows4Icon aria-hidden /> : <Rows3Icon aria-hidden />}
              {density === 'compact' ? 'Compact' : 'Comfortable'}
            </Button>
            <ColumnsMenu hidden={hidden} onChange={updateHidden} gmpEnabled={gmpEnabled} />
          </div>
          <Button
            variant="outline"
            onClick={downloadCsv}
            title="Download the rows on this page as CSV"
            className="h-10 lg:h-8"
          >
            <DownloadIcon aria-hidden />
            CSV
          </Button>
        </div>
      </div>

      <TableContainer className="hidden lg:block">
        <Table className={cn(density === 'compact' ? '[&_td]:py-1.5' : '[&_td]:py-2.5')}>
          <TableHeader>
            <TableRow className="border-0 hover:bg-transparent">
              {groups.map((g, i) => (
                <TableHead
                  key={g.id}
                  colSpan={g.span}
                  numeric={g.id !== 'issue' && g.id !== 'schedule'}
                  className={cn(
                    'h-7 pt-2 font-semibold text-[0.65rem] uppercase tracking-wider',
                    i === 0 ? 'pl-4' : 'border-border border-l',
                  )}
                >
                  {g.id === 'gmp' ? (
                    // One narrow column: the tag alone heads it; the column says GMP.
                    <span className="inline-flex items-center">
                      <span className="sr-only">{GROUP_LABEL[g.id]}, </span>
                      <UnofficialTag className="px-1.5 py-0 normal-case tracking-normal" />
                    </span>
                  ) : (
                    GROUP_LABEL[g.id]
                  )}
                </TableHead>
              ))}
              <TableHead className="w-10" aria-hidden />
            </TableRow>
            <TableRow className="hover:bg-transparent">
              {visible.map((c) => (
                <TableHead
                  key={c.id}
                  numeric={c.numeric}
                  aria-sort={
                    c.sort !== null && sort.key === c.sort
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cn(
                    'px-2.5',
                    c.id === 'company' &&
                      'sticky left-0 z-20 min-w-56 border-border border-r bg-surface-sunken pl-4',
                    groupStarts.has(c.id) && 'border-border border-l',
                  )}
                >
                  <SortHeader column={c} sort={sort} hrefFor={(k) => sortHrefs[k]} />
                </TableHead>
              ))}
              <TableHead className="w-10 pr-3">
                <span className="sr-only">Open issue</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const tone = statusParts(row, today).tone;
              return (
                <TableRow key={row.slug} className={cn(TONE_ROW[tone])}>
                  {visible.map((c) => (
                    <TableCell
                      key={c.id}
                      numeric={c.numeric}
                      className={cn(
                        'px-2.5',
                        c.id === 'company' &&
                          cn(
                            PINNED_CELL,
                            PINNED_FILL[tone] ?? 'bg-surface',
                            'border-border border-r pl-4',
                          ),
                        groupStarts.has(c.id) && 'border-border border-l',
                      )}
                    >
                      <Cell column={c.id} row={row} today={today} showBoard={showBoard} />
                    </TableCell>
                  ))}
                  <TableCell className="pr-3 pl-0">
                    <Link
                      href={issueHref(row.slug)}
                      aria-label={`Open ${row.companyName}`}
                      className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
                    >
                      <ChevronRightIcon aria-hidden className="size-4" />
                    </Link>
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
                <div className="flex min-w-0 items-start gap-2.5">
                  <IssuerMark name={row.companyName} />
                  <div className="min-w-0">
                    <Link
                      href={issueHref(row.slug)}
                      className="font-medium text-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
                    >
                      {row.companyName}
                    </Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                      {[row.nseSymbol, biddingText(row)].filter((x) => x !== null).join(' · ')}
                      {showBoard && row.board === 'sme' && <SmeMark />}
                    </p>
                  </div>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <StateChip tone={s.tone} dot>
                    {s.chip}
                  </StateChip>
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
                    <span className="figure">{times(row.subscription?.totalTimes ?? null)}</span>
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
                  <Fact label={row.listing === null ? 'Lists' : 'Now'}>
                    {row.listing === null ? (
                      <span className="figure">{listingDay(row)}</span>
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
