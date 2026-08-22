'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-display/data-table';
import { EmptyState, SkeletonRows } from '@/components/data-display/states';
import { IndicatorValue, PercentChange, Price, Ratio } from '@/components/market/numeric';
import { SetupTag, SignalBadge, SignalStrength } from '@/components/market/signal';
import { StockIdentity } from '@/components/market/stock-identity';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { StockSignalDto, SwingCandidateDto } from '@/lib/dashboard-types';

/**
 * Technical signals.
 *
 * These describe what the indicators currently show. They are not
 * recommendations, and nothing here emits BUY or SELL — that vocabulary is
 * reserved for the strategy layer, which does not exist yet.
 */
const FILTERS = ['all', 'bullish', 'bearish'] as const;
type Filter = (typeof FILTERS)[number];

export function TradingSignals({
  signals,
  loading,
  onSelect,
}: {
  signals: readonly StockSignalDto[];
  loading: boolean;
  onSelect: (symbol: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const visible = signals.filter((s) => {
    if (filter === 'bullish') return s.direction.includes('bullish');
    if (filter === 'bearish') return s.direction.includes('bearish');
    return s.direction !== 'neutral';
  });

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Technical signals</CardTitle>
          <CardDescription>Indicator readings — not recommendations</CardDescription>
        </CardHeading>
        <CardToolbar>
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(next) => {
              if (next !== '') setFilter(next as Filter);
            }}
            aria-label="Filter signals by direction"
          >
            {FILTERS.map((value) => (
              <ToggleGroupItem key={value} value={value} className="capitalize">
                {value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardToolbar>
      </CardHeader>

      <CardContent flush>
        {loading ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No directional signals"
            description="Every constituent is reading neutral on the current indicator set."
          />
        ) : (
          <ScrollArea className="max-h-104">
            <ul className="divide-y divide-border">
              {visible.slice(0, 20).map((signal) => (
                <li key={signal.symbol}>
                  <button
                    type="button"
                    onClick={() => onSelect(signal.symbol)}
                    className="w-full px-4 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StockIdentity symbol={signal.symbol}>
                        <SignalBadge direction={signal.direction} compact />
                      </StockIdentity>
                      <Price paise={signal.ltp} bare size="sm" />
                    </div>

                    <div className="mt-1.5 flex items-center gap-3">
                      <SignalStrength
                        strength={signal.strength}
                        direction={signal.direction}
                        className="max-w-40 flex-1"
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        RSI <IndicatorValue value={signal.rsi} decimals={0} />
                      </span>
                    </div>

                    {signal.setups.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {signal.setups.map((setup) => (
                          <SetupTag key={setup}>{setup}</SetupTag>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/** Swing screener — multi-condition technical filter, explicitly not advice. */
export function SwingOpportunities({
  candidates,
  loading,
  onSelect,
}: {
  candidates: readonly SwingCandidateDto[];
  loading: boolean;
  onSelect: (symbol: string) => void;
}) {
  const columns: readonly DataTableColumn<SwingCandidateDto>[] = [
    {
      id: 'symbol',
      header: 'Stock',
      sortValue: (row) => row.symbol,
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.symbol}</span>
          <PercentChange value={row.changePercent} size="xs" showGlyph={false} />
        </span>
      ),
    },
    {
      id: 'setup',
      header: 'Setup',
      hideBelow: 'md',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.setup}</span>,
    },
    {
      id: 'rsi',
      header: 'RSI',
      numeric: true,
      sortValue: (row) => row.rsi,
      cell: (row) => <IndicatorValue value={row.rsi} decimals={0} />,
    },
    {
      id: 'relativeVolume',
      header: 'Rel vol',
      numeric: true,
      hideBelow: 'sm',
      sortValue: (row) => row.relativeVolume,
      cell: (row) => <Ratio value={row.relativeVolume} size="sm" />,
    },
    {
      id: 'strength',
      header: 'Strength',
      sortValue: (row) => row.strength,
      cellClassName: 'min-w-32',
      cell: (row) => (
        <>
          <SignalStrength strength={row.strength} direction={row.direction} />
          <span className="mt-0.5 block text-[0.625rem] text-subtle-foreground">
            {row.met}/{row.total} criteria
          </span>
        </>
      ),
    },
    {
      id: 'ltp',
      header: 'LTP',
      numeric: true,
      sortValue: (row) => row.ltp,
      cell: (row) => <Price paise={row.ltp} bare size="sm" />,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>Swing opportunities</CardTitle>
          <CardDescription>Technical screen — not financial advice</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent flush>
        <DataTable
          data={candidates.slice(0, 12)}
          columns={columns}
          getRowId={(row) => row.symbol}
          status={loading ? 'loading' : 'ready'}
          onRowClick={(row) => onSelect(row.symbol)}
          emptyTitle="No setups match"
          emptyDescription="No constituent currently satisfies enough of the screen's conditions."
          caption="Swing screen candidates"
        />
      </CardContent>
    </Card>
  );
}
