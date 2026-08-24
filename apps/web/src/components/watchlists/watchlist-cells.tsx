'use client';

import type { ReactNode } from 'react';
import {
  IndicatorValue,
  Percent,
  PercentChange,
  Price,
  Ratio,
  Turnover,
  Volume,
} from '@/components/market/numeric';
import { StockIdentity } from '@/components/market/stock-identity';
import { Badge } from '@/components/ui/badge';
import * as fmt from '@/lib/format';
import { toneOf, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { getColumn } from '@/lib/watchlist-columns';
import type { WatchlistRowDto } from '@/lib/watchlist-types';

/**
 * How each watchlist column renders.
 *
 * The registry in `watchlist-columns.ts` holds everything about a column that
 * is data — its group, its source, how to read a sortable value. This holds the
 * one thing that is not: the pixels. Keeping them apart is what lets the whole
 * sorting/filtering/availability model be unit-tested without a DOM.
 *
 * Every number goes through the `market/numeric` components, so this file makes
 * no decisions about decimals, Indian grouping, tone colour or the em dash for
 * missing data. A cell that formatted its own number would be the start of the
 * table disagreeing with the rest of the product.
 */

/** Renders an unavailable column. Never a number — see the registry comment. */
function NoSource(): ReactNode {
  return (
    <span className="text-subtle-foreground" title="No data source for this field">
      <span aria-hidden>—</span>
      <span className="sr-only">No data source</span>
    </span>
  );
}

/** Price against a reference line: toned by which side of it we are on. */
function AgainstLine({ paise, reference }: { paise: number | null; reference: number | null }) {
  if (paise === null) return <Price paise={null} bare size="sm" />;
  const tone = reference === null ? 'neutral' : toneOf(reference - paise);
  return <Price paise={paise} bare size="sm" className={toneText({ tone })} />;
}

const CELLS: Record<string, (row: WatchlistRowDto) => ReactNode> = {
  symbol: (row) => (
    <StockIdentity symbol={row.symbol} name={row.name} size="sm">
      {row.indicatorDate === null && (
        <Badge
          variant="outline"
          size="sm"
          title="No end-of-day indicators stored for this instrument yet"
        >
          quote only
        </Badge>
      )}
    </StockIdentity>
  ),

  // --- Price ----------------------------------------------------------------
  ltp: (row) => <Price paise={row.ltp} bare size="sm" weight="medium" />,
  change: (row) => (
    <span className={cn('figure text-xs', toneText({ tone: toneOf(row.change) }))}>
      {fmt.signedPrice(row.change)}
    </span>
  ),
  changePercent: (row) => <PercentChange value={row.changePercent} size="sm" />,
  open: (row) => <Price paise={row.open} bare size="sm" />,
  previousClose: (row) => <Price paise={row.previousClose} bare size="sm" />,
  dayHigh: (row) => <Price paise={row.dayHigh} bare size="sm" />,
  dayLow: (row) => <Price paise={row.dayLow} bare size="sm" />,
  averagePrice: (row) => <Price paise={row.averagePrice} bare size="sm" />,

  /**
   * Where the last price sits in the day's range, as a bar.
   *
   * A number here ("73.4%") is nearly unreadable at a glance; the whole value of
   * this column is spotting the row pinned to its high, and a filled track does
   * that in one saccade across fifty rows.
   */
  dayRangePosition: (row) => {
    const value = getColumn('dayRangePosition')?.value(row);
    if (typeof value !== 'number') return <Price paise={null} bare size="sm" />;
    return (
      <span className="flex items-center justify-end gap-1.5">
        <span
          className="relative h-1 w-12 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${value.toFixed(0)}% of the day's range`}
        >
          <span
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              value >= 50 ? 'bg-bullish' : 'bg-bearish',
            )}
            style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
          />
        </span>
        <span className="figure text-[0.6875rem] text-muted-foreground">{value.toFixed(0)}%</span>
      </span>
    );
  },

  // --- Performance ----------------------------------------------------------
  high52w: (row) => <Price paise={row.high52w} bare size="sm" />,
  low52w: (row) => <Price paise={row.low52w} bare size="sm" />,
  from52wHigh: (row) => {
    const value = getColumn('from52wHigh')?.value(row);
    return <PercentChange value={typeof value === 'number' ? value : null} size="sm" />;
  },
  from52wLow: (row) => {
    const value = getColumn('from52wLow')?.value(row);
    return <PercentChange value={typeof value === 'number' ? value : null} size="sm" />;
  },

  // --- Volume ---------------------------------------------------------------
  volume: (row) => <Volume shares={row.volume} size="sm" />,
  averageVolume: (row) => <Volume shares={row.averageVolume} size="sm" />,
  relativeVolume: (row) => {
    const value = row.relativeVolume;
    return (
      <Ratio
        value={value}
        size="sm"
        // Above average is worth seeing; below it is not worth colouring, so the
        // eye is drawn only to the rows that are actually busy.
        className={value !== null && value >= 1.5 ? 'font-medium text-warning-foreground' : ''}
      />
    );
  },
  turnover: (row) => {
    const value = getColumn('turnover')?.value(row);
    return <Turnover paise={typeof value === 'number' ? value : null} size="sm" />;
  },

  // --- Technical ------------------------------------------------------------
  rsi14: (row) => {
    const value = row.rsi14;
    const tone =
      value === null
        ? ''
        : value > 70
          ? 'text-bearish-strong'
          : value < 30
            ? 'text-bullish-strong'
            : '';
    return <IndicatorValue value={value} className={tone} />;
  },
  ema20: (row) => <AgainstLine paise={row.ema20} reference={row.ltp} />,
  ema50: (row) => <AgainstLine paise={row.ema50} reference={row.ltp} />,
  ema200: (row) => <AgainstLine paise={row.ema200} reference={row.ltp} />,
  sma20: (row) => <AgainstLine paise={row.sma20} reference={row.ltp} />,
  sma50: (row) => <AgainstLine paise={row.sma50} reference={row.ltp} />,
  macdHistogram: (row) => (
    <span className={cn('figure text-xs', toneText({ tone: toneOf(row.macdHistogram) }))}>
      {fmt.signedPrice(row.macdHistogram)}
    </span>
  ),

  /** How many of the three EMAs price is above, as "2/3" plus a tone. */
  trend: (row) => {
    const value = getColumn('trend')?.value(row);
    if (typeof value !== 'number') return <IndicatorValue value={null} />;
    const variant = value === 3 ? 'bullish' : value === 0 ? 'bearish' : 'neutral';
    return (
      <Badge variant={variant} size="sm" title="EMAs (20, 50, 200) the price is trading above">
        {value}/3
      </Badge>
    );
  },

  // --- Risk -----------------------------------------------------------------
  atr14: (row) => <Price paise={row.atr14} bare size="sm" />,
  atrPercent: (row) => {
    const value = getColumn('atrPercent')?.value(row);
    return <Percent value={typeof value === 'number' ? value : null} decimals={2} size="sm" />;
  },

  // --- No data source -------------------------------------------------------
  marketCap: NoSource,
  peRatio: NoSource,
  pbRatio: NoSource,
  eps: NoSource,
  dividendYield: NoSource,

  // --- Market information ---------------------------------------------------
  sector: (row) =>
    row.sector === null ? (
      <span className="text-subtle-foreground">—</span>
    ) : (
      <span className="truncate text-xs text-muted-foreground">{row.sector}</span>
    ),
  exchange: (row) => (
    <Badge variant="outline" size="sm">
      {row.exchange}
    </Badge>
  ),
  note: (row) =>
    row.note === null || row.note === '' ? (
      <span className="text-subtle-foreground">—</span>
    ) : (
      <span className="line-clamp-1 max-w-40 text-xs text-muted-foreground" title={row.note}>
        {row.note}
      </span>
    ),
  indicatorDate: (row) => (
    <span className="figure text-[0.6875rem] text-muted-foreground">
      {row.indicatorDate ?? '—'}
    </span>
  ),
  quoteAt: (row) => (
    <span className="figure text-[0.6875rem] text-muted-foreground">
      {fmt.istTime(row.quoteAt)}
    </span>
  ),
};

/**
 * The renderer for a column id.
 *
 * Falls back to an em dash rather than throwing: a column declared in the
 * registry with no cell here is a bug, but it is not one worth blanking the
 * whole watchlist over. `watchlist-cells.test.ts` asserts the two lists match,
 * so the fallback should never be reached in practice.
 */
export function cellFor(columnId: string): (row: WatchlistRowDto) => ReactNode {
  return CELLS[columnId] ?? (() => <span className="text-subtle-foreground">—</span>);
}

export function hasCell(columnId: string): boolean {
  return columnId in CELLS;
}
