'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ROUTES } from './api-routes';

/**
 * The followed-symbols set, backed by the database.
 *
 * Every star toggle in the product reads and writes through here: the dashboard
 * widget, the stock detail drawer, and anything added later. It operates on the
 * DEFAULT watchlist, which is what "the watchlist" means outside the watchlists
 * page itself.
 *
 * This used to be `localStorage`. It moved because the tables existed and the
 * worker cannot evaluate an alert against a set of symbols living in one
 * browser's storage. Anything a previous session saved is migrated up on first
 * load, once, and then the local copy stops being consulted.
 *
 * The API shape is unchanged from the localStorage version on purpose, so the
 * components that call it did not have to change.
 */

/** The pre-database key. Read once for migration, then never again. */
const LEGACY_KEY = 'signal.watchlist.v1';
const MIGRATED_KEY = 'signal.watchlist.migrated.v1';

interface Member {
  readonly instrumentId: number;
  readonly symbol: string;
}

function readLegacy(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    if (window.localStorage.getItem(MIGRATED_KEY) !== null) return [];
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function markMigrated(): void {
  try {
    window.localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  } catch {
    // Private mode. The migration re-runs next load and the adds are
    // idempotent — the unique index makes a repeat a no-op.
  }
}

async function post<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export function useWatchlist() {
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [watchlistId, setWatchlistId] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async (): Promise<{
    id: number | null;
    members: readonly Member[];
  } | null> => {
    try {
      const response = await fetch(API_ROUTES.watchlistDefault, { cache: 'no-store' });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        watchlistId: number | null;
        members: readonly Member[];
      };
      if (!mounted.current) return null;
      setWatchlistId(payload.watchlistId);
      setMembers(payload.members);
      return { id: payload.watchlistId, members: payload.members };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    void (async () => {
      const state = await load();
      if (!mounted.current) return;

      // One-time lift of anything the browser was holding.
      const legacy = readLegacy();
      if (state !== null && legacy.length > 0) {
        let id = state.id;
        if (id === null) {
          const created = await post<{ watchlist: { id: number } }>(API_ROUTES.watchlists, {
            name: 'My Watchlist',
          });
          id = created?.watchlist.id ?? null;
        }
        if (id !== null) {
          await post(API_ROUTES.watchlistItems(id), { symbols: legacy });
          markMigrated();
          await load();
        }
      } else if (legacy.length === 0) {
        markMigrated();
      }

      if (mounted.current) setHydrated(true);
    })();

    return () => {
      mounted.current = false;
    };
  }, [load]);

  /** Creates the default list on demand, so the first star does not fail. */
  const ensureList = useCallback(async (): Promise<number | null> => {
    if (watchlistId !== null) return watchlistId;
    const created = await post<{ watchlist: { id: number } }>(API_ROUTES.watchlists, {
      name: 'My Watchlist',
    });
    const id = created?.watchlist.id ?? null;
    if (id !== null && mounted.current) setWatchlistId(id);
    return id;
  }, [watchlistId]);

  const add = useCallback(
    (symbol: string) => {
      // Optimistic: a star that waits for a round trip feels broken. The id is
      // filled in by the reload; nothing reads it before then.
      setMembers((current) =>
        current.some((member) => member.symbol === symbol)
          ? current
          : [...current, { instrumentId: -1, symbol }],
      );
      void (async () => {
        const id = await ensureList();
        if (id === null) return;
        await post(API_ROUTES.watchlistItems(id), { symbols: [symbol] });
        await load();
      })();
    },
    [ensureList, load],
  );

  const remove = useCallback(
    (symbol: string) => {
      const member = members.find((entry) => entry.symbol === symbol);
      setMembers((current) => current.filter((entry) => entry.symbol !== symbol));
      if (member === undefined || watchlistId === null || member.instrumentId < 0) return;

      void (async () => {
        await fetch(API_ROUTES.watchlistItems(watchlistId), {
          method: 'DELETE',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instrumentIds: [member.instrumentId] }),
        }).catch(() => null);
        await load();
      })();
    },
    [members, watchlistId, load],
  );

  const symbols = members.map((member) => member.symbol);

  const toggle = useCallback(
    (symbol: string) => {
      if (members.some((member) => member.symbol === symbol)) remove(symbol);
      else add(symbol);
    },
    [members, add, remove],
  );

  const move = useCallback(
    (symbol: string, index: number) => {
      const without = members.filter((entry) => entry.symbol !== symbol);
      const target = members.find((entry) => entry.symbol === symbol);
      if (target === undefined) return;

      const clamped = Math.max(0, Math.min(without.length, index));
      const next = [...without.slice(0, clamped), target, ...without.slice(clamped)];
      setMembers(next);

      if (watchlistId === null || next.some((entry) => entry.instrumentId < 0)) return;
      void fetch(API_ROUTES.watchlistItems(watchlistId), {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrumentIds: next.map((entry) => entry.instrumentId) }),
      }).catch(() => null);
    },
    [members, watchlistId],
  );

  return {
    symbols,
    hydrated,
    add,
    remove,
    toggle,
    move,
    has: (symbol: string) => members.some((member) => member.symbol === symbol),
  };
}
