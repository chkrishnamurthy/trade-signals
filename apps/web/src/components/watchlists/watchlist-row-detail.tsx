'use client';

import {
  ActivityIcon,
  BarChart3Icon,
  ListPlusIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { MarketChart } from '@/components/dashboard/chart';
import { DefinitionGrid, DefinitionRow } from '@/components/data-display/metric-card';
import { LiveIndicator } from '@/components/market/market-status';
import { Price, PriceChange } from '@/components/market/numeric';
import { SetupTag, SignalBadge, SignalStrength } from '@/components/market/signal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Text } from '@/components/ui/typography';
import { RETURN_WINDOWS } from '@/lib/return-windows';
import type { WatchlistRowDto, WatchlistSummaryDto } from '@/lib/watchlist-types';
import { cellFor } from './watchlist-cells';

/**
 * The Watchlist's inline stock summary — chart-first.
 *
 * Rendered by `DataTable` directly beneath an expanded row. The chart is the
 * headline element (the same self-fetching `MarketChart` the full drawer
 * uses, just mounted here at its natural size instead of `compact`, and only
 * once the row is actually expanded); everything else reads the same
 * `WatchlistRowDto` the collapsed row already has, through the same
 * `cellFor` renderers the table columns use — a RSI reading here and in the
 * table column are the same call, not two chances to disagree.
 *
 * Fundamentals (P/E, ROE, ROCE, …) show one explained absence rather than a
 * column of dashes: this application has no fundamentals feed (see
 * `watchlist-columns.ts`), and a summary that cannot substantiate a number
 * does not print one.
 */

const PERFORMANCE_WINDOW_IDS = ['return1w', 'return1m', 'return1y'] as const;
const PERFORMANCE_WINDOWS = RETURN_WINDOWS.filter((window) =>
  (PERFORMANCE_WINDOW_IDS as readonly string[]).includes(window.id),
);

export function WatchlistRowDetail({
  row,
  isLive,
  onViewChart,
  onViewSignals,
  otherLists,
  onAddToList,
  onRemove,
}: {
  row: WatchlistRowDto;
  isLive: boolean;
  /** Opens the full drawer — chart, metrics and the identity block at once. */
  onViewChart: (row: WatchlistRowDto) => void;
  onViewSignals: (row: WatchlistRowDto) => void;
  otherLists: readonly WatchlistSummaryDto[];
  onAddToList: (watchlistId: number, symbol: string) => void;
  onRemove: (row: WatchlistRowDto) => void;
}) {
  return (
    <div className="border-t border-border bg-muted/30 px-4 py-4 sm:px-6">
      {/* Identity line. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Text as="h4" variant="section-title">
          {row.name}
        </Text>
        <Price paise={row.ltp} size="md" weight="medium" />
        <PriceChange paise={row.change} percent={row.changePercent} />
        {row.signal !== null && <SignalBadge direction={row.signal.direction} compact />}
        <LiveIndicator
          live={isLive}
          label={isLive ? 'Live — updating automatically' : 'Market closed — last traded price'}
          className="ml-auto"
        />
      </div>

      {/* Chart first — the main attraction — with a short snapshot beside it. */}
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <MarketChart symbol={row.symbol} title="Price" previousClose={row.previousClose} />

        <div className="rounded-lg border border-border bg-surface p-3">
          <Text as="h5" variant="overline" className="mb-1.5 block">
            Stock snapshot
          </Text>
          <DefinitionGrid columns={1}>
            <DefinitionRow label="Day range" value={cellFor('dayRange')(row)} />
            <DefinitionRow label="Volume" value={cellFor('volume')(row)} />
            <DefinitionRow label="52W range" value={cellFor('range52w')(row)} />
            <DefinitionRow label="RSI (14)" value={cellFor('rsi14')(row)} />
            <DefinitionRow label="Signal" value={cellFor('signal')(row)} />
            <DefinitionRow label="Signal strength" value={cellFor('signalStrength')(row)} />
          </DefinitionGrid>
          <Button size="sm" className="mt-3 w-full" onClick={() => onViewChart(row)}>
            <BarChart3Icon />
            Full analysis
          </Button>
        </div>
      </div>

      {/* Compact analysis — same values as the table columns, reorganised. */}
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-4">
        <SummarySection title="Technical">
          <DefinitionGrid columns={1}>
            <DefinitionRow label="RSI (14)" value={cellFor('rsi14')(row)} />
            <DefinitionRow label="MACD hist" value={cellFor('macdHistogram')(row)} />
            <DefinitionRow label="Trend" value={cellFor('trend')(row)} />
            <DefinitionRow label="SMA 50" value={cellFor('sma50')(row)} />
            <DefinitionRow label="EMA 200" value={cellFor('ema200')(row)} />
          </DefinitionGrid>
        </SummarySection>

        <SummarySection title="Performance">
          <DefinitionGrid columns={1}>
            <DefinitionRow label="1D" value={cellFor('changePercent')(row)} />
            {PERFORMANCE_WINDOWS.map((window) => (
              <DefinitionRow key={window.id} label={window.label} value={cellFor(window.id)(row)} />
            ))}
          </DefinitionGrid>
        </SummarySection>

        <SummarySection title="Fundamentals">
          <span className="text-xs text-subtle-foreground">
            No fundamentals feed for this instrument — this application's data provider serves
            quotes and OHLCV history only.
          </span>
        </SummarySection>

        <SummarySection title="Signal">
          {row.signal === null ? (
            <span className="text-xs text-subtle-foreground">
              No stored daily signal for this instrument
            </span>
          ) : row.signal.setups.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.signal.setups.map((setup) => (
                <SetupTag key={setup}>{setup}</SetupTag>
              ))}
            </div>
          ) : (
            <span className="text-xs text-subtle-foreground">No named setups today</span>
          )}
          {row.signal !== null && (
            <SignalStrength
              strength={row.signal.strength}
              direction={row.signal.direction}
              className="mt-2"
            />
          )}

          <Text as="h5" variant="overline" className="mt-3 mb-1 block">
            Live intraday setup
          </Text>
          {row.setup === null ? (
            <span className="text-xs text-subtle-foreground">No live intraday setup today</span>
          ) : (
            <DefinitionGrid columns={1}>
              <DefinitionRow label="Setup" value={cellFor('setupState')(row)} />
              <DefinitionRow label="Technical entry zone" value={cellFor('entryZone')(row)} />
              <DefinitionRow label="Target" value={cellFor('setupTarget')(row)} />
              <DefinitionRow label="Invalidation" value={cellFor('setupInvalidation')(row)} />
              <DefinitionRow label="Net R:R" value={cellFor('setupRiskReward')(row)} />
            </DefinitionGrid>
          )}
        </SummarySection>
      </div>

      {/* Quick actions — one visible secondary action, the rest behind a menu. */}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={() => onViewSignals(row)}>
          <ActivityIcon />
          View signals
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${row.symbol}`}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {otherLists.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ListPlusIcon />
                  Add to another list
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {otherLists.map((list) => (
                    <DropdownMenuItem
                      key={list.id}
                      onSelect={() => onAddToList(list.id, row.symbol)}
                    >
                      {list.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem variant="destructive" onSelect={() => onRemove(row)}>
              <Trash2Icon />
              Remove from watchlist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mt-2 text-[0.6875rem] text-subtle-foreground">
        Technical observation from stored indicator and signal data. Not a recommendation.
      </p>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <Text as="h5" variant="overline" className="mb-1.5 block">
        {title}
      </Text>
      {children}
    </section>
  );
}
