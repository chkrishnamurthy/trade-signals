'use client';

import {
  ArrowDownToLineIcon,
  ArrowUpToLineIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/data-display/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { resolveColumns } from '@/lib/watchlist-columns';
import { dropMember, type MoveTarget, moveMember } from '@/lib/watchlist-order';
import type { SortRuleDto, WatchlistRowDto, WatchlistSummaryDto } from '@/lib/watchlist-types';
import { cellFor } from './watchlist-cells';
import { WatchlistRowDetail } from './watchlist-row-detail';

/**
 * The watchlist table.
 *
 * Renders through the shared `DataTable` rather than a bespoke table, so a
 * sorted column here looks and behaves exactly like a sorted column on the
 * stocks page. What this adds on top is the column set — resolved from stored
 * ids through the registry — and the per-row action menu.
 *
 * Sorting is CONTROLLED: rows arrive already sorted, because the sort is
 * persisted per watchlist and has to survive a reload. That is state the table
 * component cannot own.
 *
 * Secondary actions live behind one menu rather than as a row of icons. Six
 * icon buttons per row on a fifty-row table is three hundred tap targets and a
 * wall of noise; the menu costs one extra click for actions nobody performs on
 * every row.
 */
export function WatchlistTable({
  rows,
  columnIds,
  sort,
  status,
  errorMessage,
  otherLists,
  emptyAction,
  hasFilters,
  isLive,
  onSortChange,
  onRemove,
  onOpenDetail,
  onAddToList,
  onRetry,
  canReorder = false,
  onReorder,
  onSaveNote,
}: {
  rows: readonly WatchlistRowDto[];
  columnIds: readonly string[];
  sort: readonly SortRuleDto[];
  status: 'ready' | 'loading' | 'error';
  errorMessage?: string | undefined;
  /** Other watchlists, for "add to another list". */
  otherLists: readonly WatchlistSummaryDto[];
  emptyAction?: React.ReactNode;
  hasFilters: boolean;
  /** Whether the market is open — for the expanded row's live/last-traded wording. */
  isLive: boolean;
  onSortChange: (columnId: string, additive: boolean) => void;
  onRemove: (row: WatchlistRowDto) => void;
  /** Opens the full chart & analysis drawer. Fired from inside the expanded row. */
  onOpenDetail: (row: WatchlistRowDto) => void;
  onAddToList: (watchlistId: number, symbol: string) => void;
  onRetry?: (() => void) | undefined;
  /**
   * Whether the rows are on screen in the user's own order. False while a sort or
   * a filter is active: a drag would then reorder a list the user cannot see whole.
   */
  canReorder?: boolean | undefined;
  /** Receives EVERY member's instrument id in the new order. */
  onReorder?: ((instrumentIds: readonly number[]) => void) | undefined;
  onSaveNote?:
    | ((row: WatchlistRowDto, note: string) => Promise<{ ok: true } | { ok: false; error: string }>)
    | undefined;
}) {
  const reorderable = canReorder && onReorder !== undefined && rows.length > 1;
  const orderedIds = useMemo(() => rows.map((row) => row.instrumentId), [rows]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const move = (row: WatchlistRowDto, target: MoveTarget) => {
    const next = moveMember(orderedIds, row.instrumentId, target);
    if (next !== orderedIds) onReorder?.(next);
  };

  const columns = useMemo<DataTableColumn<WatchlistRowDto>[]>(
    () =>
      resolveColumns(columnIds).map((column) => ({
        id: column.id,
        header: column.label,
        numeric: column.numeric,
        cell: cellFor(column.id),
        // An unavailable column is not sortable: every value is null, so a
        // click would reorder nothing and look broken.
        sortValue: column.source === null ? undefined : column.value,
        hideBelow: column.hideBelow,
        pinned: column.pinned === true,
        headerClassName: column.pinned === true ? 'min-w-40' : undefined,
      })),
    [columnIds],
  );

  // Accordion expansion: expanding a row collapses whatever was open before.
  // Kept as a set (of at most one id) rather than a bare nullable id so a
  // future "let several rows stay open" tweak is a one-line change here
  // rather than a rethink of the wiring below.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  // A sort or filter change can drop the expanded stock off the visible list
  // entirely — collapse rather than hold onto a row the user can no longer see.
  useEffect(() => {
    setExpandedIds((current) => {
      if (current.size === 0) return current;
      const visible = new Set(rows.map((row) => String(row.instrumentId)));
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rows]);

  const toggleExpand = (row: WatchlistRowDto) => {
    const id = String(row.instrumentId);
    setExpandedIds((current) => (current.has(id) ? new Set() : new Set([id])));
  };

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => String(row.instrumentId)}
      status={status}
      errorMessage={errorMessage}
      onRetry={onRetry}
      stickyHeader
      sort={sort}
      onSortChange={onSortChange}
      expandedRowIds={expandedIds}
      onToggleExpand={toggleExpand}
      renderExpanded={(row) => (
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
      getRowProps={
        reorderable
          ? (row) => ({
              onDragOver: (event) => {
                if (dragId === null) return;
                event.preventDefault();
                if (overId !== row.instrumentId) setOverId(row.instrumentId);
              },
              onDrop: (event) => {
                event.preventDefault();
                if (dragId !== null) {
                  const next = dropMember(orderedIds, dragId, row.instrumentId);
                  if (next !== orderedIds) onReorder?.(next);
                }
                setDragId(null);
                setOverId(null);
              },
              className:
                dragId === row.instrumentId
                  ? 'opacity-50'
                  : overId === row.instrumentId && dragId !== null
                    ? 'bg-accent shadow-[inset_0_2px_0_var(--color-primary)]'
                    : undefined,
            })
          : undefined
      }
      emptyTitle={hasFilters ? 'No stock matches these filters' : 'Nothing on this watchlist yet'}
      emptyDescription={
        hasFilters
          ? 'Every stock is still on the list — the filters are hiding them. Clear a filter to see them again.'
          : 'Search for a stock and add it to start tracking price, volume and daily indicators.'
      }
      emptyAction={emptyAction}
      caption="Watchlist constituents with their latest quote and daily indicators"
      rowActions={(row) => (
        <div className="flex items-center gap-0.5">
          {reorderable && (
            <DragHandle
              row={row}
              onDragStart={() => setDragId(row.instrumentId)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onMove={move}
            />
          )}
          <RowMenu
            row={row}
            otherLists={otherLists}
            onRemove={onRemove}
            onToggleExpand={toggleExpand}
            onAddToList={onAddToList}
            reorderable={reorderable}
            canReorder={canReorder}
            onMove={move}
          />
        </div>
      )}
    />
  );
}

function RowMenu({
  row,
  otherLists,
  onRemove,
  onToggleExpand,
  onAddToList,
  reorderable,
  canReorder,
  onMove,
}: {
  row: WatchlistRowDto;
  otherLists: readonly WatchlistSummaryDto[];
  onRemove: (row: WatchlistRowDto) => void;
  onToggleExpand: (row: WatchlistRowDto) => void;
  onAddToList: (watchlistId: number, symbol: string) => void;
  reorderable: boolean;
  /** True when the table is in the user's own order, even if there is only one row. */
  canReorder: boolean;
  onMove: (row: WatchlistRowDto, target: MoveTarget) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.symbol}`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{row.symbol}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/*
          Same target as clicking the row or its chevron — a menu-first way to
          reach the inline analysis for keyboard/AT users who navigate by menu
          rather than by clicking the row itself.
        */}
        <DropdownMenuItem onSelect={() => onToggleExpand(row)}>
          <ChevronsUpDownIcon />
          View details
        </DropdownMenuItem>

        {canReorder && reorderable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onMove(row, 'up')}>
              <ChevronUpIcon />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(row, 'down')}>
              <ChevronDownIcon />
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(row, 'top')}>
              <ArrowUpToLineIcon />
              Move to top
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(row, 'bottom')}>
              <ArrowDownToLineIcon />
              Move to bottom
            </DropdownMenuItem>
          </>
        )}

        {otherLists.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ListPlusIcon />
                Add to another list
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {otherLists.map((list) => (
                  <DropdownMenuItem key={list.id} onSelect={() => onAddToList(list.id, row.symbol)}>
                    {list.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(row)}>
          <Trash2Icon />
          Remove from watchlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The grip that starts a drag. Only the grip is draggable, so selecting text in
 * the row or clicking it to expand never starts one. It is also a keyboard
 * control: focus it and press the arrow keys (Home / End for the ends) — drag
 * alone would leave keyboard and touch users with no way to reorder, so the row
 * menu carries the same moves.
 */
function DragHandle({
  row,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  row: WatchlistRowDto;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (row: WatchlistRowDto, target: MoveTarget) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const target: MoveTarget | null =
      event.key === 'ArrowUp'
        ? 'up'
        : event.key === 'ArrowDown'
          ? 'down'
          : event.key === 'Home'
            ? 'top'
            : event.key === 'End'
              ? 'bottom'
              : null;
    if (target === null) return;
    event.preventDefault();
    onMove(row, target);
  };

  return (
    <button
      type="button"
      draggable
      aria-label={`Reorder ${row.symbol}. Drag, or use the arrow keys.`}
      title="Drag to reorder"
      onKeyDown={onKeyDown}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        // Drag the whole row's picture, not just the grip.
        const tableRow = event.currentTarget.closest('tr');
        if (tableRow !== null) event.dataTransfer.setDragImage(tableRow, 16, 16);
        event.dataTransfer.setData('text/plain', row.symbol);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="flex size-7 cursor-grab items-center justify-center rounded-sm text-subtle-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
    >
      <GripVerticalIcon className="size-4" aria-hidden />
    </button>
  );
}
