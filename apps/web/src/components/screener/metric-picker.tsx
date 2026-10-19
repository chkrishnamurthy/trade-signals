'use client';

import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { MetricDto } from '@/lib/screener-types';
import { cn } from '@/lib/utils';

/**
 * Searchable, categorised metric list with one-line definitions — the way a
 * condition starts. Every metric explains itself before it is chosen.
 */
export function MetricPicker({
  metrics,
  categories,
  onSelect,
  children,
  align = 'start',
}: {
  metrics: readonly MetricDto[];
  categories: readonly { key: string; label: string }[];
  onSelect: (key: string) => void;
  children: React.ReactNode;
  align?: 'start' | 'end' | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(categories[0]?.key ?? 'price');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q !== '') {
      return metrics.filter(
        (m) => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
      );
    }
    return metrics.filter((m) => m.category === category);
  }, [metrics, category, query]);

  const choose = (key: string) => {
    onSelect(key);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,34rem)] p-0">
        <label className="flex items-center gap-2 border-border border-b px-3 py-2 focus-within:bg-accent/40">
          <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="sr-only">Search metrics</span>
          <input
            // biome-ignore lint/a11y/noAutofocus: the popover opens for exactly this input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${metrics.length} metrics — delivery, RSI, OI…`}
            className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="grid max-h-[min(60vh,24rem)] grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
          {query.trim() === '' && (
            <div
              role="tablist"
              aria-label="Metric categories"
              className="flex gap-1 overflow-x-auto border-border border-b bg-surface-sunken p-1.5 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0"
            >
              {categories.map((c) => {
                const count = metrics.filter((m) => m.category === c.key).length;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="tab"
                    aria-selected={category === c.key}
                    onClick={() => setCategory(c.key)}
                    className={cn(
                      'flex shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs',
                      category === c.key
                        ? 'bg-surface font-medium text-foreground shadow-subtle'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span>{c.label}</span>
                    <span className="figure text-2xs text-subtle-foreground">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <ul className="flex flex-col gap-0.5 overflow-y-auto p-1.5">
            {visible.length === 0 && (
              <li className="px-2 py-6 text-center text-muted-foreground text-xs">
                No metric matches “{query}”.
              </li>
            )}
            {visible.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => choose(m.key)}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent focus-visible:bg-accent"
                >
                  <span className="font-medium text-sm">{m.label}</span>
                  <span className="text-muted-foreground text-xs leading-snug">
                    {m.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
