'use client';

import {
  GripVerticalIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import type { WatchlistSummaryDto } from '@/lib/watchlist-types';

/**
 * The watchlist rail.
 *
 * Every list, its size, which one is the default, and the actions that change
 * them. Reordering is a drag, with the keyboard equivalents in the menu — a
 * rearrangement that only a mouse can perform is one a keyboard user cannot do
 * at all.
 *
 * Deleting asks first, and names what is being deleted. This is the one
 * irreversible action in the feature, and it takes the stocks with it.
 */
export function WatchlistSidebar({
  lists,
  activeId,
  loading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onMakeDefault,
  onReorder,
}: {
  lists: readonly WatchlistSummaryDto[];
  activeId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
  onCreate: (name: string) => Promise<{ ok: boolean; error?: string }>;
  onRename: (id: number, name: string) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: number) => void;
  onMakeDefault: (id: number) => void;
  onReorder: (ids: readonly number[]) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'rename'; list: WatchlistSummaryDto }
    | { kind: 'delete'; list: WatchlistSummaryDto }
    | null
  >(null);

  const move = (id: number, toIndex: number): void => {
    const ids = lists.map((list) => list.id);
    const from = ids.indexOf(id);
    if (from === -1 || from === toIndex) return;
    ids.splice(from, 1);
    ids.splice(toIndex, 0, id);
    onReorder(ids);
  };

  return (
    <>
      <nav aria-label="Watchlists" className="flex min-h-0 flex-col gap-1">
        <div className="flex items-center justify-between gap-2 px-1">
          <Text variant="label" className="text-muted-foreground">
            Watchlists
          </Text>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setDialog({ kind: 'create' })}
            aria-label="Create a watchlist"
          >
            <PlusIcon />
          </Button>
        </div>

        {loading && (
          <div className="flex flex-col gap-1 p-1">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-8 w-full" />
            ))}
          </div>
        )}

        {!loading && lists.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center">
            <Text variant="caption" className="text-balance">
              No watchlists yet. Create one to start tracking a set of stocks.
            </Text>
            <Button size="sm" className="mt-3" onClick={() => setDialog({ kind: 'create' })}>
              <PlusIcon />
              New watchlist
            </Button>
          </div>
        )}

        <ul className="flex flex-col gap-0.5">
          {lists.map((list, index) => (
            <li
              key={list.id}
              draggable
              onDragStart={() => setDragging(list.id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) move(dragging, index);
                setDragging(null);
              }}
              className={cn(
                'group flex items-center gap-1 rounded-md pr-1 transition-colors',
                list.id === activeId ? 'bg-accent' : 'hover:bg-muted/60',
                dragging === list.id && 'opacity-40',
              )}
            >
              <GripVerticalIcon
                className="ml-1 size-3.5 shrink-0 cursor-grab text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />

              <button
                type="button"
                onClick={() => onSelect(list.id)}
                aria-current={list.id === activeId ? 'true' : undefined}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{list.name}</span>
                {list.isDefault && (
                  <StarIcon
                    className="size-3 shrink-0 fill-current text-warning-foreground"
                    aria-label="Default watchlist"
                  />
                )}
                <Badge variant="secondary" size="sm" className="shrink-0 tabular-nums">
                  {list.count}
                </Badge>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${list.name}`}
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => setDialog({ kind: 'rename', list })}>
                    <PencilIcon />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={list.isDefault}
                    onSelect={() => onMakeDefault(list.id)}
                  >
                    <StarIcon />
                    {list.isDefault ? 'Already default' : 'Set as default'}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={index === 0}
                    onSelect={() => move(list.id, index - 1)}
                  >
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={index === lists.length - 1}
                    onSelect={() => move(list.id, index + 1)}
                  >
                    Move down
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDialog({ kind: 'delete', list })}
                  >
                    <Trash2Icon />
                    Delete watchlist
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </nav>

      <NameDialog
        open={dialog?.kind === 'create' || dialog?.kind === 'rename'}
        title={dialog?.kind === 'rename' ? 'Rename watchlist' : 'New watchlist'}
        description={
          dialog?.kind === 'rename'
            ? 'The stocks and the column layout stay as they are.'
            : 'Group the names you want to follow together — a sector, a strategy, a theme.'
        }
        initial={dialog?.kind === 'rename' ? dialog.list.name : ''}
        confirmLabel={dialog?.kind === 'rename' ? 'Rename' : 'Create'}
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          if (dialog?.kind === 'rename') return onRename(dialog.list.id, name);
          return onCreate(name);
        }}
      />

      <Dialog open={dialog?.kind === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{dialog?.kind === 'delete' ? dialog.list.name : ''}”?</DialogTitle>
            <DialogDescription>
              {dialog?.kind === 'delete' && dialog.list.count > 0
                ? `This removes the watchlist and its ${dialog.list.count} ${dialog.list.count === 1 ? 'stock' : 'stocks'}. It cannot be undone.`
                : 'This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (dialog?.kind === 'delete') onDelete(dialog.list.id);
                setDialog(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NameDialog({
  open,
  title,
  description,
  initial,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  initial: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed when a different list opens the dialog.
  const [seeded, setSeeded] = useState(initial);
  if (open && seeded !== initial) {
    setSeeded(initial);
    setName(initial);
    setError(null);
  }

  const commit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setBusy(true);
    setError(null);
    const result = await onSubmit(trimmed);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save that name.');
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="watchlist-name">Name</Label>
          <Input
            id="watchlist-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commit();
            }}
            placeholder="Swing trading"
            maxLength={60}
            autoFocus
          />
          {error !== null && (
            <Text variant="caption" className="text-destructive">
              {error}
            </Text>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void commit()} disabled={name.trim() === '' || busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
