'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
 */
export function StockSearch({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Close on an outside click, the way a combobox is expected to behave.
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const choose = useCallback(
    (symbol: string) => {
      onSelect(symbol);
      setQuery('');
      setResults([]);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && results[0] !== undefined) choose(results[0].symbol);
        }}
        placeholder="Search stocks…"
        aria-label="Search stocks"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="stock-search-results"
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500"
      />

      {open && (query.trim().length > 0 || loading) && (
        <div
          id="stock-search-results"
          className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {loading && results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">No matches</p>
          ) : (
            <ul>
              {results.map((hit) => (
                <li key={hit.symbol}>
                  <button
                    type="button"
                    onClick={() => choose(hit.symbol)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{hit.symbol}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {hit.name}
                      </span>
                    </span>
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {hit.kind === 'index' ? 'Index' : hit.exchange}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
