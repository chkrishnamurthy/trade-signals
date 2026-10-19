'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SkeletonRows } from '@/components/data-display/loading';
import { SearchInput } from '@/components/forms/filter-bar';
import { StockIdentity } from '@/components/market/stock-identity';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { API_ROUTES } from '@/lib/api-routes';
import { cn } from '@/lib/utils';

interface SearchHit {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'equity' | 'index';
  readonly exchange: string;
}

/**
 * Global symbol search — the "SearchBar" of the navigation spec.
 *
 * Lives in the application header, so it is reachable from every route. Where a
 * hit goes is the caller's decision (AppShell sends it to the stock page).
 *
 * Accessibility: a WAI-ARIA 1.2 combobox. The field keeps focus the whole time
 * (`aria-activedescendant` points at the highlighted option), ↑/↓ move through
 * the results, Enter opens the highlighted one, Escape closes the list, and a
 * polite live region announces how many results there are.
 *
 * Shortcut: `/` or Ctrl/⌘ K focuses the field from anywhere — the convention
 * of TradingView, Kite and most of the web. `/` is ignored while typing in
 * another field so it never eats a character.
 *
 * Debounced at 250ms and aborting the previous request on each keystroke — the
 * symbol master has ~10,000 rows and an un-debounced search fires a request per
 * character.
 */
export function StockSearch({
  onSelect,
  shortcut = false,
  stocksOnly = false,
  className,
}: {
  onSelect: (symbol: string) => void;
  /**
   * Offer equities only. The header search opens the stock page, which is not
   * built for an index — indices are one tap away in the indices strip, whose
   * drawer charts them.
   */
  stocksOnly?: boolean | undefined;
  /** Register the global `/` and Ctrl/⌘ K shortcuts. Only one instance should. */
  shortcut?: boolean | undefined;
  className?: string | undefined;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      setActive(-1);
      setLoading(false);
      setFailed(false);
      setSearched(false);
      return;
    }

    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setResults([]);
    setLoading(false);
    setFailed(false);
    setSearched(false);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(API_ROUTES.search(query), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Search unavailable');
        const payload = (await response.json()) as { results?: SearchHit[] };
        const hits = payload.results ?? [];
        setResults(stocksOnly ? hits.filter((hit) => hit.kind === 'equity') : hits);
        setActive(-1);
        setSearched(true);
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
          setSearched(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, stocksOnly]);

  useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const slash = event.key === '/' && !typing && !event.metaKey && !event.ctrlKey;
      if (!commandK && !slash) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcut]);

  const choose = useCallback(
    (symbol: string) => {
      onSelect(symbol);
      abort.current?.abort();
      setLoading(false);
      setSearched(false);
      setQuery('');
      setResults([]);
      setActive(-1);
      setOpen(false);
    },
    [onSelect],
  );

  const showPanel = open && (loading || failed || searched || results.length > 0);
  const status = loading && results.length === 0 ? 'Searching…' : `${results.length} results`;

  return (
    <Popover open={showPanel} onOpenChange={setOpen}>
      <div className={cn('relative min-w-0', className)}>
        <PopoverAnchor asChild>
          <SearchInput
            ref={input}
            value={query}
            onValueChange={(next) => {
              setQuery(next);
              setLoading(false);
              setFailed(false);
              setSearched(false);
              setResults([]);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && results.length > 0) {
                event.preventDefault();
                setOpen(true);
                setActive((current) => (current + 1) % results.length);
              } else if (event.key === 'ArrowUp' && results.length > 0) {
                event.preventDefault();
                setActive((current) => (current <= 0 ? results.length - 1 : current - 1));
              } else if (event.key === 'Enter') {
                const hit = results[active] ?? results[0];
                if (hit !== undefined) {
                  event.preventDefault();
                  choose(hit.symbol);
                }
              } else if (event.key === 'Escape') {
                if (showPanel) setOpen(false);
                else input.current?.blur();
              }
            }}
            placeholder={stocksOnly ? 'Search stocks' : 'Search stocks & indices'}
            role="combobox"
            aria-label={stocksOnly ? 'Search stocks' : 'Search stocks and indices'}
            aria-autocomplete="list"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            className="w-full"
          />
        </PopoverAnchor>
        {shortcut && query === '' && (
          <kbd
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-mono text-3xs text-muted-foreground xl:block"
          >
            /
          </kbd>
        )}
        <span role="status" aria-live="polite" className="sr-only">
          {showPanel ? status : ''}
        </span>
      </div>

      <PopoverContent
        align="start"
        className="max-h-80 w-(--radix-popover-trigger-width) min-w-72 overflow-y-auto p-1"
        // Keeps the caret in the field so typing continues to filter.
        onOpenAutoFocus={(event) => event.preventDefault()}
        // Clicking back into the field must not count as "outside".
        onInteractOutside={(event) => {
          if (event.target instanceof Node && input.current?.contains(event.target)) {
            event.preventDefault();
          }
        }}
      >
        {loading && results.length === 0 ? (
          <SkeletonRows rows={3} label="Searching stocks" />
        ) : failed ? (
          <p role="status" className="px-2 py-1.5 text-muted-foreground text-xs">
            Search unavailable. Try again.
          </p>
        ) : searched && results.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground text-xs">No matches</p>
        ) : (
          <div id={listId} role="listbox" aria-label="Search results">
            {results.map((hit, index) => (
              // Focus stays in the field (aria-activedescendant), so options take
              // -1: reachable by the pointer and by assistive tech, not by Tab.
              <div
                key={hit.symbol}
                id={optionId(index)}
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                // mousedown would blur the field and close the list first.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(hit.symbol)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    choose(hit.symbol);
                  }
                }}
                onMouseMove={() => setActive(index)}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5',
                  index === active && 'bg-accent',
                )}
              >
                <StockIdentity symbol={hit.symbol} name={hit.name} />
                <Badge variant="secondary" size="sm" className="shrink-0 uppercase">
                  {hit.kind === 'index' ? 'Index' : hit.exchange}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
