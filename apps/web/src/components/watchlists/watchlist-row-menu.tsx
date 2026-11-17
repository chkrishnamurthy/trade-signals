'use client';

import {
  ArrowDownToLineIcon,
  ArrowUpToLineIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from 'lucide-react';
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
import { useIsPhone } from '@/lib/use-media-query';
import type { MoveTarget } from '@/lib/watchlist-order';
import type { WatchlistRowDto, WatchlistSummaryDto } from '@/lib/watchlist-types';

/**
 * A watchlist row's "…" menu — the same menu in the desktop table and the
 * phone list, so a stock can be expanded, moved, copied to another list or
 * removed the same way at every width.
 */
export function RowMenu({
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
  const phone = useIsPhone();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.symbol}`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="max-h-(--radix-dropdown-menu-content-available-height) w-56 overflow-y-auto"
      >
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
            {/* A fly-out has nowhere to fly on a phone: list the lists flat. */}
            {phone ? (
              <>
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Add to another list
                </DropdownMenuLabel>
                {otherLists.map((list) => (
                  <DropdownMenuItem key={list.id} onSelect={() => onAddToList(list.id, row.symbol)}>
                    <ListPlusIcon />
                    {list.name}
                  </DropdownMenuItem>
                ))}
              </>
            ) : (
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
