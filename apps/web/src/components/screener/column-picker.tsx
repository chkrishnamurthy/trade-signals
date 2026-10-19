'use client';

import { Columns3Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { MetricDto } from '@/lib/screener-types';

export const MAX_COLUMNS = 14;

/** Choose result columns by category; order follows the catalogue. */
export function ColumnPicker({
  metrics,
  categories,
  columns,
  onChange,
}: {
  metrics: readonly MetricDto[];
  categories: readonly { key: string; label: string }[];
  columns: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const chosen = new Set(columns);
  const toggle = (key: string, on: boolean) => {
    if (on && chosen.size >= MAX_COLUMNS) return;
    const order = metrics.map((m) => m.key);
    const next = on ? [...columns, key] : columns.filter((c) => c !== key);
    onChange(next.sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Columns3Icon aria-hidden />
          Columns
          <span className="figure text-muted-foreground text-xs">{columns.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,30rem)] w-[min(92vw,26rem)] overflow-y-auto p-3"
      >
        <p className="mb-2 text-muted-foreground text-xs">
          Up to {MAX_COLUMNS} columns. Stock, sparkline and selection are always shown.
        </p>
        <div className="flex flex-col gap-3">
          {categories.map((c) => (
            <fieldset key={c.key} className="flex flex-col gap-1">
              <legend className="mb-1 font-medium text-2xs text-muted-foreground uppercase tracking-wide">
                {c.label}
              </legend>
              <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                {metrics
                  .filter((m) => m.category === c.key)
                  .map((m) => (
                    <div
                      key={m.key}
                      className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
                    >
                      <Checkbox
                        id={`column-${m.key}`}
                        checked={chosen.has(m.key)}
                        disabled={!chosen.has(m.key) && chosen.size >= MAX_COLUMNS}
                        onCheckedChange={(on) => toggle(m.key, on === true)}
                      />
                      <label
                        htmlFor={`column-${m.key}`}
                        className="cursor-pointer truncate"
                        title={m.description}
                      >
                        {m.label}
                      </label>
                    </div>
                  ))}
              </div>
            </fieldset>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
