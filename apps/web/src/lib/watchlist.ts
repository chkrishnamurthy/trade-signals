'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Watchlist persistence.
 *
 * localStorage, not the database: there is no schema yet (the design docs that
 * define it are still outstanding), and this is a single-user local tool so
 * per-device storage loses nothing. Swapping in a table later means changing
 * only the four functions below.
 */

const STORAGE_KEY = 'signal.watchlist.v1';

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function write(symbols: readonly string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // Quota or private mode — the watchlist stays in memory for this session.
  }
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read after mount: localStorage does not exist during SSR, and reading it
  // during render would produce a hydration mismatch.
  useEffect(() => {
    setSymbols(read());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: string[]) => {
    setSymbols(next);
    write(next);
  }, []);

  const add = useCallback(
    (symbol: string) => {
      persist(symbols.includes(symbol) ? symbols : [...symbols, symbol]);
    },
    [symbols, persist],
  );

  const remove = useCallback(
    (symbol: string) => {
      persist(symbols.filter((s) => s !== symbol));
    },
    [symbols, persist],
  );

  const toggle = useCallback(
    (symbol: string) => {
      persist(
        symbols.includes(symbol) ? symbols.filter((s) => s !== symbol) : [...symbols, symbol],
      );
    },
    [symbols, persist],
  );

  /** Moves `symbol` to `index`, for drag-free reordering. */
  const move = useCallback(
    (symbol: string, index: number) => {
      const without = symbols.filter((s) => s !== symbol);
      const clamped = Math.max(0, Math.min(without.length, index));
      persist([...without.slice(0, clamped), symbol, ...without.slice(clamped)]);
    },
    [symbols, persist],
  );

  return { symbols, hydrated, add, remove, toggle, move, has: (s: string) => symbols.includes(s) };
}
