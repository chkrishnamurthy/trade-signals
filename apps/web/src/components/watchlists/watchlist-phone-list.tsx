'use client';

import { ListIcon } from 'lucide-react';
import { SkeletonRows } from '@/components/data-display/loading';
import { EmptyState, ErrorState } from '@/components/data-display/states';
import { FlashOnChange } from '@/components/market/flash-on-change';
import { PercentChange, Price } from '@/components/market/numeric';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { resolveColumns } from '@/lib/watchlist-columns';
import type { MoveTarget } from '@/lib/watchlist-order';
import type { SortRuleDto, WatchlistRowDto, WatchlistSummaryDto } from '@/lib/watchlist-types';
import { cellFor } from './watchlist-cells';
import { WatchlistRowDetail } from './watchlist-row-detail';
import { RowMenu } from './watchlist-row-menu';

/**
 * The watchlist on a phone: one two-line row per stock, the way every broker
 * app lists a watchlist.
 *
 *   SYMBOL                     1,117.50
 *   Company name                ▲ +2.96%     …
 *
 * A table at 375px could show three columns and scrolled the rest out of
 * reach; the columns that matter on a phone are the ticker, the price and the
 * day's move, and everything else is one tap away in the expanded row, which
 * here spans the full width instead of riding a sideways-scrolling table.
 *
 * Sorting has no column headers to tap, so it is a select above the list. The
 * first four columns chosen in "Columns" show under each row as label–value
 * pairs, so the same choice shapes the table and the list.
 */
export function WatchlistPhoneList({
  rows,
  columnIds,
  sort,
  status,
  errorMessage,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  isLive,
  otherLists,
  expandedIds,
  onToggleExpand,
  onSortSet,
  onRemove,
  onOpenDetail,
  onAddToList,
  onSaveNote,
  reorderable,
  canReorder,
  onMove,
}: {
  rows: readonly WatchlistRowDto[];
  /** The columns chosen in "Columns", in order; the first few show under each row. */
  columnIds: readonly string[];
  sort: readonly SortRuleDto[];
  status: 'ready' | 'loading' | 'error';
  errorMessage?: string | undefined;
  onRetry?: (() => void) | undefined;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  isLive: boolean;
  otherLists: readonly WatchlistSummaryDto[];
  expandedIds: ReadonlySet<string>;
  onToggleExpand: (row: WatchlistRowDto) => void;
  /** Replaces the sort. Absent: the select is not shown. */
  onSortSet?: ((sort: readonly SortRuleDto[]) => void) | undefined;
  onRemove: (row: WatchlistRowDto) => void;
  onOpenDetail: (row: WatchlistRowDto) => void;
  onAddToList: (watchlistId: number, symbol: string) => void;
  onSaveNote?:
    | ((row: WatchlistRowDto, note: string) => Promise<{ ok: true } | { ok: false; error: string }>)
    | undefined;
  reorderable: boolean;
  canReorder: boolean;
  onMove: (row: WatchlistRowDto, target: MoveTarget) => void;
}) {
  // The ticker, price and move are the row itself; the next chosen columns sit
  // under it as label–value pairs. Capped so fifty rows stay scannable: the
  // rest are in the expanded row. Order them in "Columns" to pick which show.
  const extras = resolveColumns(columnIds)
    .filter((column) => !ROW_COLUMNS.has(column.id))
    .slice(0, PHONE_EXTRA_COLUMNS);

  if (status === 'loading') return <SkeletonRows rows={8} label="Loading watchlist" />;
  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load this watchlist"
        description={errorMessage}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {onSortSet !== undefined && rows.length > 1 && (
        <SortSelect sort={sort} onSortSet={onSortSet} />
      )}
      {rows.length === 0 ? (
        <EmptyState
          icon={<ListIcon />}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <ul
          aria-label="Stocks on this watchlist"
          className="m-0 list-none divide-y divide-border p-0"
        >
          {rows.map((row) => {
            const id = String(row.instrumentId);
            const expanded = expandedIds.has(id);
            return (
              <li key={id}>
                <div className={cn('flex items-center', expanded && 'bg-accent/40')}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => onToggleExpand(row)}
                    className="flex min-h-14 min-w-0 flex-1 flex-col justify-center gap-1.5 py-2 pl-4 text-left outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-semibold text-sm">{row.symbol}</span>
                          {row.indicatorDate === null && (
                            <Badge variant="outline" size="sm" className="shrink-0">
                              quote only
                            </Badge>
                          )}
                        </span>
                        <span className="truncate text-muted-foreground text-xs">{row.name}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <FlashOnChange value={row.ltp}>
                          <Price paise={row.ltp} bare size="md" weight="semibold" />
                        </FlashOnChange>
                        <PercentChange value={row.changePercent} size="sm" />
                      </span>
                    </span>
                    {extras.length > 0 && (
                      <span className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {/* Label over value: a range ("2,932 – 2,990") needs the
                            whole half-width, which a side-by-side pair cannot give. */}
                        {extras.map((column) => (
                          <span key={column.id} className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-2xs text-muted-foreground">
                              {column.label}
                            </span>
                            <span className="w-fit max-w-full">{cellFor(column.id)(row)}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                  <div className="shrink-0 px-1">
                    <RowMenu
                      row={row}
                      otherLists={otherLists}
                      onRemove={onRemove}
                      onToggleExpand={onToggleExpand}
                      onAddToList={onAddToList}
                      reorderable={reorderable}
                      canReorder={canReorder}
                      onMove={onMove}
                    />
                  </div>
                </div>
                {expanded && (
                  <WatchlistRowDetail
                    row={row}
                    isLive={isLive}
                    onViewChart={onOpenDetail}
                    otherLists={otherLists}
                    onAddToList={onAddToList}
                    onRemove={onRemove}
                    onSaveNote={onSaveNote}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Already shown by the row itself. */
const ROW_COLUMNS: ReadonlySet<string> = new Set(['symbol', 'ltp', 'changePercent']);
/** How many chosen columns a phone row shows beneath the price. */
export const PHONE_EXTRA_COLUMNS = 4;

/** The orders a phone user actually reaches for. Value = `columnId:direction`. */
const SORTS = [
  { value: 'manual', label: 'Your order' },
  { value: 'changePercent:desc', label: 'Change % — biggest rise' },
  { value: 'changePercent:asc', label: 'Change % — biggest fall' },
  { value: 'ltp:desc', label: 'Price — high to low' },
  { value: 'ltp:asc', label: 'Price — low to high' },
  { value: 'symbol:asc', label: 'Name — A to Z' },
] as const;

function SortSelect({
  sort,
  onSortSet,
}: {
  sort: readonly SortRuleDto[];
  onSortSet: (sort: readonly SortRuleDto[]) => void;
}) {
  const first = sort[0];
  const current = first === undefined ? 'manual' : `${first.columnId}:${first.direction}`;
  const known = SORTS.some((option) => option.value === current);
  return (
    <div className="flex items-center justify-between gap-3 border-border border-b px-4 py-2">
      <span id="watchlist-sort" className="text-muted-foreground text-xs">
        Sort
      </span>
      <Select
        value={known ? current : 'other'}
        onValueChange={(value) => {
          if (value === 'other') return;
          if (value === 'manual') {
            onSortSet([]);
            return;
          }
          const [columnId, direction] = value.split(':');
          if (columnId === undefined || (direction !== 'asc' && direction !== 'desc')) return;
          onSortSet([{ columnId, direction }]);
        }}
      >
        <SelectTrigger aria-labelledby="watchlist-sort" className="min-w-0 max-w-[70%]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {!known && (
            <SelectItem value="other" disabled>
              Set on a wider screen
            </SelectItem>
          )}
          {SORTS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
