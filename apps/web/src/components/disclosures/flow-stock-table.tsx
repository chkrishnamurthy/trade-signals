'use client';

import { SearchIcon, StarIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/data-display/states';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/layout/page';
import { Percent, PercentChange, Price } from '@/components/market/numeric';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Text } from '@/components/ui/typography';
import type { AttentionFactorDto, OiBuildupDto, StockFlowRowDto } from '@/lib/disclosure-types';
import { BUILDUP_HINT, BUILDUP_LABEL, buildupTone, contracts } from '@/lib/flow-labels';
import { type Tone, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { formatDateKey, NetValue, Segmented } from './parts';

/**
 * The ranked stock table — the page's answer to "which stocks deserve
 * attention, and why".
 *
 * Each row carries its own session dates: delivery and price are from the
 * evening bhavdata, OI from the morning-after derivatives pass, so the OI
 * column can legitimately be a session behind. Attention orders the table
 * and renders only with its factor chips.
 */

export type SignalFilter = 'any' | 'delivery' | 'buildup' | 'deals';
export type SortKey = 'attention' | 'delivery' | 'oi' | 'deals' | 'change';

const SIGNAL_OPTIONS = [
  { id: 'any', label: 'Any' },
  { id: 'delivery', label: 'Delivery spike' },
  { id: 'buildup', label: 'OI build-up' },
  { id: 'deals', label: 'Deal this week' },
] as const;

const SORT_OPTIONS = [
  { id: 'attention', label: 'Attention' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'oi', label: 'OI change' },
  { id: 'deals', label: 'Deals' },
  { id: 'change', label: 'Price' },
] as const;

/** Delivery must exceed its trailing average by this many points to count as a spike. */
const DELIVERY_SPIKE_POINTS = 10;

export function filterStocks(
  rows: readonly StockFlowRowDto[],
  filters: { signal: SignalFilter; fnoOnly: boolean; search: string },
): StockFlowRowDto[] {
  const needle = filters.search.trim().toUpperCase();
  return rows.filter((row) => {
    if (filters.fnoOnly && !row.inFno) return false;
    if (
      needle !== '' &&
      !row.symbol.includes(needle) &&
      !row.companyName.toUpperCase().includes(needle)
    )
      return false;
    switch (filters.signal) {
      case 'delivery':
        return row.delivery !== null && (row.delivery.delta ?? 0) >= DELIVERY_SPIKE_POINTS;
      case 'buildup':
        return row.oi !== null && row.oi.buildup !== null;
      case 'deals':
        return row.deals !== null;
      default:
        return true;
    }
  });
}

export function sortStocks(rows: readonly StockFlowRowDto[], key: SortKey): StockFlowRowDto[] {
  const value = (row: StockFlowRowDto): number => {
    switch (key) {
      case 'delivery':
        return row.delivery?.delta ?? Number.NEGATIVE_INFINITY;
      case 'oi':
        return row.oi?.changePercent === null || row.oi === null
          ? Number.NEGATIVE_INFINITY
          : Math.abs(row.oi.changePercent);
      case 'deals':
        return row.deals === null ? Number.NEGATIVE_INFINITY : Math.abs(row.deals.netPaise);
      case 'change':
        return row.price?.changePercent ?? Number.NEGATIVE_INFINITY;
      default:
        return row.attention.score;
    }
  };
  return [...rows].sort((a, b) => value(b) - value(a) || (a.symbol < b.symbol ? -1 : 1));
}

export function StocksSection({
  rows,
  asOf,
  oiAsOf,
  watchlistOnly,
  onOpen,
}: {
  rows: readonly StockFlowRowDto[];
  asOf: string | null;
  oiAsOf: string | null;
  watchlistOnly: boolean;
  onOpen: (symbol: string) => void;
}) {
  const [signal, setSignal] = useState<SignalFilter>('any');
  const [fnoOnly, setFnoOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('attention');
  const [limit, setLimit] = useState(50);

  const visible = useMemo(
    () => sortStocks(filterStocks(rows, { signal, fnoOnly, search }), sort),
    [rows, signal, fnoOnly, search, sort],
  );
  const shown = visible.slice(0, limit);

  return (
    <Section aria-labelledby="stocks-heading">
      <SectionHeader>
        <SectionTitle id="stocks-heading">Stocks with institutional footprints</SectionTitle>
        <SectionDescription>
          {asOf === null
            ? 'Delivery, futures positioning and large deals, per stock'
            : `Delivery and price for ${formatDateKey(asOf)}${
                oiAsOf !== null && oiAsOf !== asOf
                  ? `; futures OI for ${formatDateKey(oiAsOf)}`
                  : ''
              }`}
        </SectionDescription>
      </SectionHeader>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Signal"
            value={signal}
            onChange={setSignal}
            options={SIGNAL_OPTIONS}
          />
          <Segmented
            ariaLabel="Universe"
            value={fnoOnly ? 'fno' : 'all'}
            onChange={(id) => setFnoOnly(id === 'fno')}
            options={[
              { id: 'all', label: 'All' },
              { id: 'fno', label: 'F&O only' },
            ]}
          />
          <Segmented ariaLabel="Sort by" value={sort} onChange={setSort} options={SORT_OPTIONS} />
          <div className="relative ml-auto w-full sm:w-56">
            <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a stock"
              className="h-8 pl-7 text-xs"
              aria-label="Find a stock"
            />
          </div>
        </div>
      )}

      <Card>
        <CardContent className="px-0 py-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={watchlistOnly ? 'Nothing for your watchlist yet' : 'No stock data yet'}
                description="Delivery figures arrive the same evening; futures OI the next morning."
              />
            </div>
          ) : shown.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No stocks match"
                description="Widen the signal or universe filter."
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stock</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                      <TableHead>Futures OI</TableHead>
                      <TableHead className="text-right">Deals (7d)</TableHead>
                      <TableHead className="text-right">Close</TableHead>
                      <TableHead>Why</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((row) => (
                      <StockRow key={row.instrumentId} row={row} onOpen={onOpen} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="divide-y divide-border md:hidden">
                {shown.map((row) => (
                  <StockCard key={row.instrumentId} row={row} onOpen={onOpen} />
                ))}
              </ul>
              {visible.length > shown.length && (
                <div className="border-t border-border p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setLimit((n) => n + 50)}
                    className="text-primary text-xs hover:underline"
                  >
                    Show {Math.min(50, visible.length - shown.length)} more of {visible.length}
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Section>
  );
}

function StockRow({ row, onOpen }: { row: StockFlowRowDto; onOpen: (symbol: string) => void }) {
  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => onOpen(row.symbol)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(row.symbol);
        }
      }}
      tabIndex={0}
      aria-label={`Open ${row.symbol}`}
    >
      <TableCell>
        <StockName row={row} />
      </TableCell>
      <TableCell className="text-right">
        <DeliveryCell delivery={row.delivery} />
      </TableCell>
      <TableCell>
        <OiCell oi={row.oi} />
      </TableCell>
      <TableCell className="text-right">
        <DealsCell deals={row.deals} />
      </TableCell>
      <TableCell className="text-right">
        <PriceCell price={row.price} />
      </TableCell>
      <TableCell>
        <AttentionChips factors={row.attention.factors} />
      </TableCell>
    </TableRow>
  );
}

function StockCard({ row, onOpen }: { row: StockFlowRowDto; onOpen: (symbol: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.symbol)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-accent/40"
      >
        <div className="flex items-start justify-between gap-3">
          <StockName row={row} />
          <PriceCell price={row.price} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <Text as="span" variant="nano" className="block uppercase">
              Delivery
            </Text>
            <DeliveryCell delivery={row.delivery} align="left" />
          </div>
          <div>
            <Text as="span" variant="nano" className="block uppercase">
              Futures OI
            </Text>
            <OiCell oi={row.oi} />
          </div>
          {row.deals !== null && (
            <div className="col-span-2">
              <Text as="span" variant="nano" className="block uppercase">
                Deals (7d)
              </Text>
              <DealsCell deals={row.deals} align="left" />
            </div>
          )}
        </div>
        <AttentionChips factors={row.attention.factors} />
      </button>
    </li>
  );
}

function StockName({ row }: { row: StockFlowRowDto }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5">
        <span className="font-medium text-sm">{row.symbol}</span>
        {row.onWatchlist && (
          <StarIcon aria-label="On your watchlist" className="size-3 fill-warning text-warning" />
        )}
        {row.inFno && (
          <Badge variant="outline" size="sm" className="font-normal">
            F&amp;O
          </Badge>
        )}
      </span>
      <span className="truncate text-muted-foreground text-xs">{row.companyName}</span>
    </span>
  );
}

function DeliveryCell({
  delivery,
  align = 'right',
}: {
  delivery: StockFlowRowDto['delivery'];
  align?: 'left' | 'right';
}) {
  if (delivery === null) return <span className="text-muted-foreground">—</span>;
  const delta = delivery.delta;
  const tone: Tone =
    delta === null ? 'neutral' : delta > 0 ? 'bullish' : delta < 0 ? 'bearish' : 'neutral';
  return (
    <span className={cn('flex flex-col', align === 'right' ? 'items-end' : 'items-start')}>
      <Percent value={delivery.percent} decimals={0} className="font-medium" />
      <span className={cn('figure text-2xs', toneText({ tone }))}>
        {delta === null
          ? 'no baseline'
          : `${delta > 0 ? '+' : ''}${delta.toFixed(0)} pts vs avg ${(delivery.trailingPercent ?? 0).toFixed(0)}%`}
      </span>
    </span>
  );
}

function OiCell({ oi }: { oi: StockFlowRowDto['oi'] }) {
  if (oi === null) return <span className="text-muted-foreground text-xs">Not in F&amp;O</span>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <PercentChange value={oi.changePercent} size="sm" />
        {oi.buildup !== null && <BuildupBadge buildup={oi.buildup} />}
      </span>
      <span className="figure text-2xs text-muted-foreground">OI {contracts(oi.futuresOi)}</span>
    </span>
  );
}

export function BuildupBadge({ buildup }: { buildup: OiBuildupDto }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={buildupTone(buildup)} size="sm" className="cursor-default">
          {BUILDUP_LABEL[buildup]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{BUILDUP_HINT[buildup]}</TooltipContent>
    </Tooltip>
  );
}

function DealsCell({
  deals,
  align = 'right',
}: {
  deals: StockFlowRowDto['deals'];
  align?: 'left' | 'right';
}) {
  if (deals === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('flex flex-col', align === 'right' ? 'items-end' : 'items-start')}>
      <NetValue paise={deals.netPaise} className="text-sm" />
      <span className="text-2xs text-muted-foreground">
        {deals.count} {deals.count === 1 ? 'deal' : 'deals'}
      </span>
    </span>
  );
}

function PriceCell({ price }: { price: StockFlowRowDto['price'] }) {
  if (price === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col items-end">
      <Price paise={price.close} className="font-medium" />
      <PercentChange value={price.changePercent} size="xs" />
    </span>
  );
}

/**
 * The "why" chips. One per factor with data, each showing its contribution
 * as a filled fraction and its reading on hover. No chips means no factor
 * had data — the row is in the table because it is followed or in F&O.
 */
export function AttentionChips({ factors }: { factors: readonly AttentionFactorDto[] }) {
  if (factors.length === 0)
    return <span className="text-muted-foreground text-2xs">No reading</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {factors.map((factor) => {
        const tone: Tone =
          factor.tone === 'positive'
            ? 'bullish'
            : factor.tone === 'negative'
              ? 'bearish'
              : 'neutral';
        return (
          <li key={factor.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex cursor-default items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs',
                    factor.contribution === 0 && 'opacity-60',
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-6 overflow-hidden rounded-full bg-border"
                  >
                    <span
                      className={cn('block h-full', {
                        'bg-bullish': tone === 'bullish',
                        'bg-bearish': tone === 'bearish',
                        'bg-neutral': tone === 'neutral',
                      })}
                      style={{ width: `${Math.round(factor.contribution * 100)}%` }}
                    />
                  </span>
                  {factor.label}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {factor.label}: {factor.reading}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
