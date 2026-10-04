'use client';

import { MoreHorizontalIcon, PencilIcon, PlusIcon, StarIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
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
import type { WatchlistSummaryDto, WatchlistTemplateDto } from '@/lib/watchlist-types';
import { StarterLists } from './starter-lists';

/**
 * The watchlist selector, as a horizontal strip of tabs.
 *
 * Replaces the old vertical sidebar so the table beneath gets the full page
 * width. Every tab is name + count, click to switch — management (rename,
 * default, reorder, delete) lives behind a small trigger on the ACTIVE tab
 * only, rather than a hover-menu on every tab: the bar stays exactly as
 * uncluttered as a plain row of pills, and the actions for the list you're
 * already looking at are still one click away.
 *
 * Reordering is a drag (axis is the only thing that changed from the sidebar
 * this replaced), with "Move left"/"Move right" in the active tab's menu as
 * the keyboard equivalent — a rearrangement only a mouse can do is one a
 * keyboard user cannot do at all.
 */
export function WatchlistTabs({
  lists,
  activeId,
  loading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onPickTemplate,
  creatingTemplateId,
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
  /** Creates a filled list from a starter template; resolves true once it is open. */
  onPickTemplate: (template: WatchlistTemplateDto) => Promise<boolean>;
  creatingTemplateId: string | null;
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
      <nav
        aria-label="Watchlists"
        className="flex min-w-0 items-center gap-1.5 border-b border-border"
      >
        <ul className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
          {loading &&
            [0, 1, 2].map((key) => <Skeleton key={key} className="mb-2 h-5 w-20 shrink-0" />)}

          {!loading &&
            lists.map((list, index) => {
              const active = list.id === activeId;
              return (
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
                  className={cn('flex shrink-0 items-center', dragging === list.id && 'opacity-40')}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelect(list.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      '-mb-px gap-1.5 rounded-none border-b-2 border-transparent px-0.5 hover:bg-transparent',
                      active
                        ? 'border-primary font-semibold text-foreground'
                        : 'font-medium text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="max-w-36 truncate">{list.name}</span>
                    {list.isDefault && (
                      <StarIcon
                        className="size-3 shrink-0 fill-current text-primary"
                        aria-label="Default watchlist"
                      />
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-subtle-foreground">
                      {list.count}
                    </span>
                  </Button>

                  {active && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${list.name}`}
                          className="-mb-px ml-0.5"
                        >
                          <MoreHorizontalIcon className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
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
                          Move left
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === lists.length - 1}
                          onSelect={() => move(list.id, index + 1)}
                        >
                          Move right
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
                  )}
                </li>
              );
            })}
        </ul>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mb-px shrink-0 gap-1 rounded-none border-b-2 border-transparent px-0.5 font-semibold text-primary hover:bg-transparent hover:text-primary"
          onClick={() => setDialog({ kind: 'create' })}
        >
          <PlusIcon className="size-3.5" />
          <span className="hidden sm:inline">Watchlist</span>
        </Button>
      </nav>

      <NameDialog
        open={dialog?.kind === 'rename'}
        title="Rename watchlist"
        description="The stocks and the column layout stay as they are."
        initial={dialog?.kind === 'rename' ? dialog.list.name : ''}
        confirmLabel="Rename"
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          if (dialog?.kind === 'rename') return onRename(dialog.list.id, name);
          return { ok: false, error: 'Nothing to rename.' };
        }}
      />

      <NewWatchlistDialog
        open={dialog?.kind === 'create'}
        creatingTemplateId={creatingTemplateId}
        onClose={() => setDialog(null)}
        onCreate={onCreate}
        onPickTemplate={onPickTemplate}
      />

      <Dialog open={dialog?.kind === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete "{dialog?.kind === 'delete' ? dialog.list.name : ''}"?</DialogTitle>
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

/**
 * New watchlist: a starter list in one click, or an empty one by name.
 *
 * The templates sit ABOVE the name field because they are the faster path
 * and the one a new user needs; the empty list is still one field away for
 * anyone who knows what they want.
 */
function NewWatchlistDialog({
  open,
  creatingTemplateId,
  onClose,
  onCreate,
  onPickTemplate,
}: {
  open: boolean;
  creatingTemplateId: string | null;
  onClose: () => void;
  onCreate: (name: string) => Promise<{ ok: boolean; error?: string }>;
  onPickTemplate: (template: WatchlistTemplateDto) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setName('');
    setError(null);
    onClose();
  };

  const commit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setBusy(true);
    setError(null);
    const result = await onCreate(trimmed);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not create that list.');
      return;
    }
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New watchlist</DialogTitle>
          <DialogDescription>
            Start from an index or a sector — it becomes your own list to edit — or name an empty
            one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <StarterLists
            compact
            busyId={creatingTemplateId}
            onPick={(template) => {
              void onPickTemplate(template).then((ok) => {
                if (ok) close();
              });
            }}
          />

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" aria-hidden />
            <Text variant="caption">or an empty list</Text>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-watchlist-name">Name</Label>
            <div className="flex gap-2">
              <Input
                id="new-watchlist-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commit();
                }}
                placeholder="Swing trading"
                maxLength={60}
              />
              <Button onClick={() => void commit()} disabled={name.trim() === '' || busy}>
                Create
              </Button>
            </div>
            {error !== null && (
              <Text variant="caption" className="text-destructive">
                {error}
              </Text>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
