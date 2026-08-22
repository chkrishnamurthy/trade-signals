'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchInput } from '@/components/forms/filter-bar';
import { StockIdentity } from '@/components/market/stock-identity';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

interface SearchHit {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'equity' | 'index';
  readonly exchange: string;
}

/**
 * Global symbol search.
 *
 * Debounced at 250ms and aborting the previous request on each keystroke — the
 * symbol master has ~10,000 rows and an un-debounced search fires a request per
 * character.
 *
 * The results panel is a Radix Popover anchored to the field, which handles
 * outside-click, Escape and focus containment. The field keeps focus while the
 * list is open, so typing continues to narrow the results.
 */
export function StockSearch({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { results?: SearchHit[] };
        setResults(payload.results ?? []);
      } catch {
        // Aborted or offline — leave the previous results in place.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const choose = useCallback(
    (symbol: string) => {
      onSelect(symbol);
      setQuery('');
      setResults([]);
      setOpen(false);
    },
    [onSelect],
  );

  const showPanel = open && (query.trim().length > 0 || loading);

  return (
    <Popover open={showPanel} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <SearchInput
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && results[0] !== undefined) choose(results[0].symbol);
          }}
          placeholder="Search stocks…"
          aria-label="Search stocks"
          className="w-40 sm:w-56 lg:w-72"
        />
      </PopoverAnchor>

      <PopoverContent
        align="end"
        className="max-h-80 w-(--radix-popover-trigger-width) min-w-64 overflow-y-auto p-1"
        // Keeps the caret in the field so typing continues to filter.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {loading && results.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</p>
        ) : results.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches</p>
        ) : (
          <ul>
            {results.map((hit) => (
              <li key={hit.symbol}>
                <button
                  type="button"
                  onClick={() => choose(hit.symbol)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent"
                >
                  <StockIdentity symbol={hit.symbol} name={hit.name} />
                  <Badge variant="secondary" size="sm" className="shrink-0 uppercase">
                    {hit.kind === 'index' ? 'Index' : hit.exchange}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
