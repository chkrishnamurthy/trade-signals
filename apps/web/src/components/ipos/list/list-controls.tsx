'use client';

import { SearchIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

/** Writes filter changes into the URL; any filter change returns to page 1. */
export function useUrlParams(): (updates: Record<string, string | null>) => void {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (updates) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      // Any filter change returns to the first page.
      if (!('page' in updates)) next.delete('page');
      const qs = next.toString();
      router.push(
        (qs === '' ? pathname : `${pathname}?${qs}`) as Parameters<typeof router.push>[0],
        {
          scroll: false,
        },
      );
    },
    [params, pathname, router],
  );
}

/**
 * The two list controls that need a browser: the year picker and the search
 * box. Both write the URL and the server re-renders — a filtered list is
 * always a shareable link. Status filters are plain links beside them.
 */
export function ListControls({
  years,
  year,
  currentYear,
  q,
}: {
  years: readonly number[];
  /** Null = every year. */
  year: number | null;
  currentYear: number;
  q: string;
}) {
  const setParams = useUrlParams();
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
      <label className="flex items-center gap-2 text-muted-foreground text-sm">
        <span className="shrink-0">Year</span>
        <select
          value={year === null ? 'all' : String(year)}
          onChange={(event) => {
            const v = event.target.value;
            setParams({ year: v === String(currentYear) ? null : v });
          }}
          className="h-10 w-full rounded-md border border-input bg-surface px-2 text-foreground text-sm shadow-subtle focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring sm:h-9 sm:w-auto"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
          <option value="all">All years</option>
        </select>
      </label>
      <SearchBox initial={q} onSearch={(value) => setParams({ q: value })} />
    </div>
  );
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  // Debounced so a keystroke does not fire a navigation per character.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (value.trim() !== initial.trim()) onSearch(value.trim());
    }, 350);
    return () => clearTimeout(handle);
  }, [value, initial, onSearch]);
  return (
    <div className="relative w-full sm:w-60">
      <SearchIcon
        aria-hidden
        className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Company or symbol"
        aria-label="Search IPOs by company or symbol"
        className="h-10 pl-8 sm:h-9"
      />
    </div>
  );
}
