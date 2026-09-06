'use client';

import { CheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SkeletonRows } from '@/components/data-display/states';
import { SearchInput } from '@/components/forms/filter-bar';
import { StockAvatar } from '@/components/market/stock-identity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Text } from '@/components/ui/typography';
import { API_ROUTES } from '@/lib/api-routes';
import { cn } from '@/lib/utils';

/**
 * Add stocks.
 *
 * Optimised for the thing people actually do: type three letters, hit enter,
 * type three more. The input keeps focus after every add, results are keyboard
 * navigable, and the dialog does not close until it is dismissed — because
 * closing after one add turns "add six names" into six round trips through a
 * dialog.
 *
 * Symbols already in the watchlist are shown and marked rather than filtered
 * out. A user searching for a stock they already added needs to be told that,
 * not left wondering why their search returns nothing.
 */

interface SearchHit {
  readonly symbol: string;
  readonly name: string;
  readonly kind: string;
  readonly exchange: string;
}

/** Long enough to stop typing, short enough not to feel laggy. */
const DEBOUNCE_MS = 180;

export function AddStocks({
  existingSymbols,
  onAdd,
  disabled,
  trigger,
}: {
  existingSymbols: readonly string[];
  onAdd: (symbols: readonly string[]) => Promise<{ ok: boolean; error?: string }>;
  disabled?: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<readonly SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [staged, setStaged] = useState<readonly SearchHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<readonly string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const existing = useMemo(
    () => new Set(existingSymbols.map((symbol) => symbol.toUpperCase())),
    [existingSymbols],
  );
  const stagedSymbols = useMemo(
    () => new Set(staged.map((hit) => hit.symbol.toUpperCase())),
    [staged],
  );

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q === '') {
      setHits([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      void (async () => {
        try {
          const response = await fetch(API_ROUTES.search(q), {
            signal: controller.signal,
            cache: 'no-store',
          });
          const payload: unknown = await response.json();
          if (controller.signal.aborted) return;
          const results = (payload as { results?: readonly SearchHit[] }).results ?? [];
          setHits(results);
          setCursor(0);
        } catch {
          if (!controller.signal.aborted) setHits([]);
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, open]);

  const stage = useCallback(
    (hit: SearchHit) => {
      if (existing.has(hit.symbol.toUpperCase())) return;
      setStaged((current) =>
        current.some((entry) => entry.symbol === hit.symbol) ? current : [...current, hit],
      );
      setQuery('');
      setHits([]);
      inputRef.current?.focus();
    },
    [existing],
  );

  const unstage = useCallback((symbol: string) => {
    setStaged((current) => current.filter((entry) => entry.symbol !== symbol));
  }, []);

  const commit = useCallback(async () => {
    if (staged.length === 0) return;
    setBusy(true);
    setError(null);

    const result = await onAdd(staged.map((hit) => hit.symbol));

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not add these stocks.');
      return;
    }
    setJustAdded(staged.map((hit) => hit.symbol));
    setStaged([]);
    inputRef.current?.focus();
  }, [staged, onAdd]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (hits.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor((current) => Math.min(current + 1, hits.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((current) => Math.max(current - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const hit = hits[cursor];
        if (hit !== undefined) stage(hit);
      }
    },
    [hits, cursor, stage],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setHits([]);
          setStaged([]);
          setError(null);
          setJustAdded([]);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" disabled={disabled}>
            <PlusIcon />
            Add stocks
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add stocks</DialogTitle>
          <DialogDescription>
            Search by company name, symbol or ticker. Enter adds the highlighted result.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <SearchInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            onKeyDown={onKeyDown}
            placeholder="RELIANCE, Infosys, HDFC…"
            aria-label="Search for a stock"
            autoFocus
          />

          {/* Results */}
          <div className="min-h-40">
            {searching && query.trim() !== '' && <SkeletonRows rows={3} className="px-2 py-1" />}

            {!searching && query.trim() !== '' && hits.length === 0 && (
              <div className="px-2 py-6 text-center">
                <Text variant="label">No match for “{query.trim()}”</Text>
                <Text variant="caption">Try the ticker, or part of the company name.</Text>
              </div>
            )}

            {!searching && hits.length > 0 && (
              <ScrollArea className="max-h-56">
                <ul className="flex flex-col gap-0.5">
                  {hits.map((hit, index) => {
                    const already = existing.has(hit.symbol.toUpperCase());
                    const pending = stagedSymbols.has(hit.symbol.toUpperCase());
                    return (
                      <li key={`${hit.exchange}:${hit.symbol}`}>
                        <button
                          type="button"
                          disabled={already}
                          onMouseEnter={() => setCursor(index)}
                          onClick={() => stage(hit)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                            index === cursor && !already && 'bg-muted',
                            already && 'opacity-55',
                          )}
                        >
                          <StockAvatar symbol={hit.symbol} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-xs font-medium">{hit.symbol}</span>
                            <span className="truncate text-[0.6875rem] text-muted-foreground">
                              {hit.name}
                            </span>
                          </span>
                          <Badge variant="outline" size="sm">
                            {hit.exchange}
                          </Badge>
                          {already ? (
                            <Badge variant="secondary" size="sm">
                              <CheckIcon aria-hidden />
                              In list
                            </Badge>
                          ) : pending ? (
                            <Badge variant="default" size="sm">
                              Queued
                            </Badge>
                          ) : (
                            <PlusIcon className="size-3.5 text-muted-foreground" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}

            {query.trim() === '' && staged.length === 0 && justAdded.length === 0 && (
              <div className="px-2 py-6 text-center">
                <Text variant="caption">
                  Start typing to search every instrument the provider lists.
                </Text>
              </div>
            )}

            {query.trim() === '' && justAdded.length > 0 && staged.length === 0 && (
              <div className="flex flex-col items-center gap-1 px-2 py-6 text-center">
                <Badge variant="bullish">
                  <CheckIcon aria-hidden />
                  Added {justAdded.length}
                </Badge>
                <Text variant="caption">{justAdded.join(', ')} — keep going, or close.</Text>
              </div>
            )}
          </div>

          {/* Staged */}
          {staged.length > 0 && (
            <div className="flex flex-wrap gap-1 rounded-md border border-border p-2">
              {staged.map((hit) => (
                <Badge key={hit.symbol} variant="secondary" className="gap-1 pr-1">
                  {hit.symbol}
                  <button
                    type="button"
                    onClick={() => unstage(hit.symbol)}
                    className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <XIcon className="size-3" aria-hidden />
                    <span className="sr-only">Remove {hit.symbol}</span>
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {error !== null && (
            <Text variant="caption" className="text-destructive">
              {error}
            </Text>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
          <Button onClick={() => void commit()} disabled={staged.length === 0} loading={busy}>
            Add {staged.length > 0 ? staged.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
