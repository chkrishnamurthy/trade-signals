'use client';

import { GripVerticalIcon, RotateCcwIcon, SettingsIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { SearchInput } from '@/components/forms/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import {
  DEFAULT_COLUMN_IDS,
  getColumn,
  groupedColumns,
  isColumnAvailable,
  PINNED_COLUMN_ID,
  type WatchlistColumn,
} from '@/lib/watchlist-columns';

/**
 * Customize columns.
 *
 * Two halves, because they answer two different questions and mixing them is
 * what makes column pickers overwhelming:
 *
 *   left    "which columns do I want?"  — grouped, searchable, checkboxes
 *   right   "in what order?"            — only the chosen ones, draggable
 *
 * A single list that is both a picker and a sorter has to show forty rows in a
 * drag-ordered list, and finding the one you want in it is worse than either
 * job done separately.
 *
 * Columns with no data source render disabled with the reason attached, rather
 * than being hidden. A user looking for P/E should find out that this product
 * has no fundamentals feed — not silently fail to find the column.
 */
export function ColumnPanel({
  columnIds,
  onChange,
  trigger,
}: {
  /** Ordered visible ids, excluding the implicit pinned column. */
  columnIds: readonly string[];
  onChange: (next: readonly string[]) => void;
  trigger?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);

  const groups = useMemo(() => groupedColumns(query), [query]);
  const selected = useMemo(() => new Set(columnIds), [columnIds]);

  const chosen = useMemo(
    () =>
      columnIds
        .map((id) => getColumn(id))
        .filter((column): column is WatchlistColumn => column !== null),
    [columnIds],
  );

  const toggle = useCallback(
    (id: string, on: boolean) => {
      onChange(on ? [...columnIds, id] : columnIds.filter((entry) => entry !== id));
    },
    [columnIds, onChange],
  );

  const move = useCallback(
    (id: string, toIndex: number) => {
      const from = columnIds.indexOf(id);
      if (from === -1 || from === toIndex) return;
      const next = [...columnIds];
      next.splice(from, 1);
      next.splice(toIndex, 0, id);
      onChange(next);
    },
    [columnIds, onChange],
  );

  const isDefault =
    columnIds.length === DEFAULT_COLUMN_IDS.length - 1 &&
    columnIds.every((id, index) => id === DEFAULT_COLUMN_IDS[index + 1]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <SettingsIcon />
            Columns
            <Badge variant="secondary" size="sm">
              {chosen.length + 1}
            </Badge>
          </Button>
        )}
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Customize columns</SheetTitle>
          <SheetDescription>
            Choose what this watchlist shows and in what order. Saved per watchlist.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="min-h-0 p-0">
          <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[1fr_18rem]">
            {/* Available ------------------------------------------------- */}
            <div className="flex min-h-0 flex-col border-b border-border md:border-r md:border-b-0">
              <div className="border-b border-border p-3">
                <SearchInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search columns…"
                  aria-label="Search available columns"
                />
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-4 p-3">
                  {groups.length === 0 && (
                    <Text variant="caption" className="py-6 text-center">
                      No column matches “{query}”.
                    </Text>
                  )}

                  {groups.map((group) => (
                    <section key={group.group} className="flex flex-col gap-1">
                      <Text variant="label" className="px-1 text-muted-foreground">
                        {group.label}
                      </Text>

                      <div className="grid gap-0.5 sm:grid-cols-2">
                        {group.columns.map((column) => {
                          const available = isColumnAvailable(column);
                          const id = `column-${column.id}`;
                          return (
                            <div
                              key={column.id}
                              className={cn(
                                'flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors',
                                available ? 'hover:bg-muted/60' : 'opacity-60',
                              )}
                            >
                              <Checkbox
                                id={id}
                                className="mt-0.5"
                                checked={selected.has(column.id)}
                                disabled={!available}
                                onCheckedChange={(checked) => toggle(column.id, checked === true)}
                              />
                              <div className="min-w-0 flex-1">
                                <Label htmlFor={id} className="block cursor-pointer text-xs">
                                  {column.label}
                                </Label>
                                <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                                  {available ? (
                                    column.description
                                  ) : (
                                    <span className="text-warning-foreground">
                                      No data source — this app has no fundamentals feed
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Order ------------------------------------------------------ */}
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-border px-3 py-2">
                <Text variant="label">Order</Text>
                <Text variant="caption">Drag to rearrange</Text>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <ul className="flex flex-col gap-0.5 p-2">
                  {/* The pinned column, shown so the order list matches the
                      table, but not draggable and not removable. */}
                  <li className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="size-3.5" />
                    {getColumn(PINNED_COLUMN_ID)?.label ?? 'Stock'}
                    <Badge variant="outline" size="sm" className="ml-auto">
                      pinned
                    </Badge>
                  </li>

                  {chosen.map((column, index) => (
                    <li
                      key={column.id}
                      draggable
                      onDragStart={() => setDragging(column.id)}
                      onDragEnd={() => setDragging(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragging !== null) move(dragging, index);
                        setDragging(null);
                      }}
                      className={cn(
                        'flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors active:cursor-grabbing',
                        'hover:bg-muted/60',
                        dragging === column.id && 'opacity-40',
                      )}
                    >
                      <GripVerticalIcon
                        className="size-3.5 shrink-0 text-subtle-foreground"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{column.label}</span>

                      {/* Keyboard equivalents for the drag. A reorder that can
                          only be done with a mouse is a reorder half the users
                          cannot do. */}
                      <span className="flex shrink-0">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === 0}
                          onClick={() => move(column.id, index - 1)}
                          aria-label={`Move ${column.label} earlier`}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === chosen.length - 1}
                          onClick={() => move(column.id, index + 1)}
                          aria-label={`Move ${column.label} later`}
                        >
                          ↓
                        </Button>
                      </span>
                    </li>
                  ))}

                  {chosen.length === 0 && (
                    <li className="px-2 py-6 text-center">
                      <Text variant="caption">
                        No columns beyond the ticker. Pick some on the left.
                      </Text>
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </div>
          </div>
        </SheetBody>

        <SheetFooter className="flex-row items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={isDefault}
            onClick={() => onChange(DEFAULT_COLUMN_IDS.slice(1))}
          >
            <RotateCcwIcon />
            Reset to default
          </Button>
          <Text variant="caption">
            {chosen.length + 1} column{chosen.length === 0 ? '' : 's'} shown
          </Text>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
