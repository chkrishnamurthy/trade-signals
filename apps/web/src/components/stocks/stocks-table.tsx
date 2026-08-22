'use client';

import { useMemo } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-display/data-table';
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
import { Card, CardContent } from '@/components/ui/card';
import type { StockSignalDto } from '@/lib/dashboard-types';
import { rangePosition, yearRangePosition } from '@/lib/market-math';
import type { StockRowDto } from '@/lib/stocks-types';
import { TONE_GLYPH, toneText } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * The all-stocks table.
 *
 * Columns only; sorting, pagination, column hiding and the loading / error /
 * empty states all belong to `DataTable`. The one rule this file enforces on
 * top of it is that an indicator the slow feed has not delivered renders an em
 * dash — every `market/numeric` component does that for `null`, so the cells
 * pass `?? null` rather than defaulting to zero.
 *
 * `strength` is deliberately absent. A score does not render without the
 * factors that produced it, and those do not fit in a table cell; both live in
 * the detail drawer a row click opens.
 */

/** How many of EMA 20 / 50 / 200 the last close sits above. Null until known. */
function trendCount(signal: StockSignalDto | undefined): number | null {
  if (signal === undefined) return null;
  const emas = [signal.ema20, signal.ema50, signal.ema200];
  if (emas.every((ema) => ema === null)) return null;
  return emas.filter((ema) => ema !== null && signal.ltp > ema).length;
}

/** How many of the three EMAs we actually have, so "2/3" is never a lie. */
function trendTotal(signal: StockSignalDto | undefined): number {
  if (signal === undefined) return 0;
  return [signal.ema20, signal.ema50, signal.ema200].filter((ema) => ema !== null).length;
}

export function StocksTable({
  rows,
  technicals,
  status,
  errorMessage,
  onRetry,
  onRowClick,
  onResetFilters,
  filtered,
}: {
  rows: readonly StockRowDto[];
  /** Indicators by symbol. Empty until the slow feed lands. */
  technicals: ReadonlyMap<string, StockSignalDto>;
  status: 'ready' | 'loading' | 'error';
  errorMessage?: string | undefined;
  onRetry?: (() => void) | undefined;
  onRowClick: (row: StockRowDto) => void;
  onResetFilters: () => void;
  /** Whether the empty result is the universe or the user's filters. */
  filtered: boolean;
}) {
  const columns = useMemo<DataTableColumn<StockRowDto>[]>(
    () => [
      {
        id: 'symbol',
        header: 'Stock',
        hideable: false,
        sortValue: (row) => row.symbol,
        cell: (row) => <StockIdentity symbol={row.symbol} name={row.name} size="sm" />,
      },
      {
        id: 'sector',
        header: 'Sector',
        hideBelow: 'lg',
        sortValue: (row) => row.sector,
        cell: (row) => (
          <Badge variant="outline" size="sm">
            {row.sector}
          </Badge>
        ),
      },
      {
        id: 'ltp',
        header: 'LTP',
        numeric: true,
        sortValue: (row) => row.ltp,
        cell: (row) => <Price paise={row.ltp} bare size="sm" />,
      },
      {
        id: 'change',
        header: 'Change',
        numeric: true,
        sortValue: (row) => row.changePercent,
        cell: (row) => <PercentChange value={row.changePercent} size="sm" />,
      },
      {
        id: 'range',
        header: 'Day range',
        numeric: true,
        hideBelow: 'lg',
        sortValue: (row) => positionOf(row),
        cell: (row) => {
          const position = positionOf(row);
          return <Percent value={position === null ? null : position * 100} size="sm" />;
        },
      },
      {
        id: 'volume',
        header: 'Volume',
        numeric: true,
        hideBelow: 'md',
        sortValue: (row) => row.volume,
        cell: (row) => <Volume shares={row.volume} size="sm" />,
      },
      {
        id: 'rvol',
        header: 'Rel. vol',
        numeric: true,
        hideBelow: 'lg',
        sortValue: (row) => row.relativeVolume,
        cell: (row) => <Ratio value={row.relativeVolume} size="sm" />,
      },
      {
        id: 'turnover',
        header: 'Turnover',
        numeric: true,
        hideBelow: 'xl',
        sortValue: (row) => row.turnover,
        cell: (row) => <Turnover paise={row.turnover} size="sm" />,
      },
      {
        id: 'rsi',
        header: 'RSI',
        numeric: true,
        hideBelow: 'lg',
        sortValue: (row) => technicals.get(row.symbol)?.rsi ?? null,
        cell: (row) => <IndicatorValue value={technicals.get(row.symbol)?.rsi ?? null} />,
      },
      {
        id: 'trend',
        header: 'vs EMA',
        numeric: true,
        hideBelow: 'xl',
        sortValue: (row) => trendCount(technicals.get(row.symbol)),
        cell: (row) => {
          const signal = technicals.get(row.symbol);
          const above = trendCount(signal);
          const total = trendTotal(signal);
          if (above === null || total === 0) {
            return (
              <span className="text-subtle-foreground">
                —<span className="sr-only">Not available</span>
              </span>
            );
          }
          // Above all of them is an uptrend, below all of them a downtrend;
          // anything between is genuinely mixed and must not be coloured as
          // though it were a verdict.
          const tone = above === total ? 'bullish' : above === 0 ? 'bearish' : 'neutral';
          return (
            <span className={cn('figure inline-flex items-baseline gap-1', toneText({ tone }))}>
              <span aria-hidden className="text-[0.75em]">
                {TONE_GLYPH[tone]}
              </span>
              {above}/{total}
            </span>
          );
        },
      },
      {
        id: 'pos52w',
        header: '52w pos',
        numeric: true,
        hideBelow: 'xl',
        sortValue: (row) => yearPositionOf(row, technicals),
        cell: (row) => {
          const position = yearPositionOf(row, technicals);
          return <Percent value={position === null ? null : position * 100} size="sm" />;
        },
      },
    ],
    [technicals],
  );

  return (
    <Card>
      <CardContent flush>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.symbol}
          status={status}
          errorMessage={errorMessage}
          onRetry={onRetry}
          onRowClick={onRowClick}
          initialSort={{ columnId: 'change', direction: 'desc' }}
          stickyHeader
          columnVisibility
          caption="Every tracked constituent with its latest quote and daily indicators"
          emptyTitle={filtered ? 'No stocks match these filters' : 'No stocks tracked'}
          emptyDescription={
            filtered
              ? 'Widen the sector or index selection, or clear the search.'
              : 'Add an index block to config/indices.yaml to populate this list.'
          }
          {...(filtered
            ? {
                emptyAction: (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Reset filters
                  </button>
                ),
              }
            : {})}
        />
      </CardContent>
    </Card>
  );
}

/** Day-range position, with the same thin-range guard the breadth counters use. */
function positionOf(row: StockRowDto): number | null {
  return rangePosition(row.ltp, row.low, row.high);
}

function yearPositionOf(
  row: StockRowDto,
  technicals: ReadonlyMap<string, StockSignalDto>,
): number | null {
  const signal = technicals.get(row.symbol);
  if (signal === undefined) return null;
  return yearRangePosition(row.ltp, signal.low52w, signal.high52w);
}
