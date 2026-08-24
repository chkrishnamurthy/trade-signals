'use client';

import { BookmarkIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import type { SavedViewDto, WatchlistLayoutDto } from '@/lib/watchlist-types';
import { isQuickViewAvailable, missingSourcesFor, QUICK_VIEWS } from '@/lib/watchlist-views';

/**
 * Quick views, and the user's own saved configurations beside them.
 *
 * A quick view changes columns, sort and filters in one click. It does NOT
 * change which stocks are in the list, and the copy says so — a user who
 * clicks "Top gainers" and sees three rows must not think they lost stocks.
 *
 * Views whose columns this app has no source for are rendered disabled with
 * the reason, rather than hidden. Hiding them makes the product look smaller
 * than it is; showing them broken makes it look wrong. Naming the missing feed
 * is the only honest option.
 */
export function QuickViews({
  activeId,
  savedViews,
  layout,
  onApply,
  onApplySaved,
  onSave,
  onDeleteSaved,
}: {
  activeId: string | null;
  savedViews: readonly SavedViewDto[];
  layout: WatchlistLayoutDto;
  onApply: (viewId: string) => void;
  onApplySaved: (view: SavedViewDto) => void;
  onSave: (input: { name: string; global: boolean }) => Promise<{ ok: boolean; error?: string }>;
  onDeleteSaved: (viewId: number) => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [global, setGlobal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setBusy(true);
    setError(null);
    const result = await onSave({ name: trimmed, global });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save this view.');
      return;
    }
    setSaveOpen(false);
    setName('');
    setGlobal(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
        {QUICK_VIEWS.map((view) => {
          const available = isQuickViewAvailable(view);
          const missing = available ? [] : missingSourcesFor(view);
          return (
            <Button
              key={view.id}
              variant={activeId === view.id ? 'default' : 'ghost'}
              size="sm"
              disabled={!available}
              onClick={() => onApply(view.id)}
              title={
                available
                  ? view.description
                  : `Needs data this app does not have: ${missing.join(', ')}`
              }
              className={cn('shrink-0', !available && 'opacity-50')}
            >
              {view.label}
            </Button>
          );
        })}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="shrink-0">
            <BookmarkIcon />
            <span className="hidden sm:inline">Saved</span>
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Your saved views</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {savedViews.length === 0 && (
            <div className="px-2 py-3">
              <Text variant="caption">
                Nothing saved yet. Arrange the columns and filters, then save them.
              </Text>
            </div>
          )}

          {savedViews.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onSelect={() => onApplySaved(view)}
              className="justify-between gap-2"
            >
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              {view.watchlistId === null && (
                <span className="shrink-0 text-[0.625rem] text-muted-foreground">all lists</span>
              )}
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDeleteSaved(view.id);
                }}
                className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2Icon className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaveOpen(true)}>
            Save current configuration…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>
              Stores the current columns, sort and filters — {layout.columns.length + 1} columns
              under a name you can re-apply.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commit();
                }}
                placeholder="Momentum scan"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
              <Label htmlFor="view-global" className="cursor-pointer text-xs font-normal">
                Available on every watchlist
                <span className="block text-[0.6875rem] text-muted-foreground">
                  Off: only on this one
                </span>
              </Label>
              <Switch id="view-global" checked={global} onCheckedChange={setGlobal} />
            </div>

            {error !== null && (
              <Text variant="caption" className="text-destructive">
                {error}
              </Text>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void commit()} disabled={name.trim() === '' || busy}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
