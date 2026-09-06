'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import type { Feed } from './feed';
import type { MarketErrorDto } from './market-types';
import type {
  SavedViewDto,
  WatchlistDetailDto,
  WatchlistLayoutDto,
  WatchlistSummaryDto,
} from './watchlist-types';

/**
 * Watchlist client state.
 *
 * Two feeds, as everywhere else in this app, because they cost different
 * things: the sidebar list is one cheap query and changes only when the user
 * edits it, while the detail feed batches a live quote call and polls on the
 * server's interval. Folding them together would make switching lists refetch
 * every list's prices.
 *
 * Layout writes are optimistic and debounced. Toggling a column must feel
 * instant and must not spend a round trip per keystroke in the column search
 * box; the server is the durable copy, not the source of truth for the frame
 * currently on screen.
 */

const LAYOUT_SAVE_DEBOUNCE_MS = 600;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Every mutation answers the same shape, so callers branch once. */
export type MutationResult<T> = { ok: true; data: T } | { ok: false; error: MarketErrorDto };

async function request<T>(url: string, init?: RequestInit): Promise<MutationResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return {
        ok: false,
        error: (payload as MarketErrorDto | null) ?? {
          error: `Request failed (${response.status})`,
          code: 'HTTP',
        },
      };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    return {
      ok: false,
      error: {
        error: error instanceof Error ? error.message : 'Network request failed',
        code: 'NETWORK',
      },
    };
  }
}

export function useWatchlists() {
  const [lists, setLists] = useState<Feed<readonly WatchlistSummaryDto[]>>({ status: 'loading' });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Feed<WatchlistDetailDto>>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = activeId;

  // A live mirror of the loaded lists, so a mutation can name a list in a toast
  // ("Added to Banking") without taking `lists` as a callback dependency.
  const listsRef = useRef<readonly WatchlistSummaryDto[]>([]);
  if (lists.status === 'ready') listsRef.current = lists.data;

  const { toast } = useToast();

  const isVisible = useCallback(() => typeof document === 'undefined' || !document.hidden, []);

  // --- Sidebar --------------------------------------------------------------

  const loadLists = useCallback(async (): Promise<readonly WatchlistSummaryDto[] | null> => {
    const result = await request<{ watchlists: readonly WatchlistSummaryDto[] }>('/api/watchlists');
    if (!mounted.current) return null;

    if (!result.ok) {
      setLists({ status: 'error', error: result.error });
      return null;
    }
    setLists({ status: 'ready', data: result.data.watchlists, stale: false });
    return result.data.watchlists;
  }, []);

  // --- Detail ---------------------------------------------------------------

  const loadDetail = useCallback(async (id: number, quiet = false): Promise<number> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    if (!quiet) setIsRefreshing(true);

    try {
      const response = await fetch(`/api/watchlists/${id}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload = await readJson(response);
      if (!mounted.current || activeIdRef.current !== id) return 60;

      if (!response.ok) {
        const error = (payload as MarketErrorDto | null) ?? {
          error: 'Could not load this watchlist.',
          code: 'HTTP',
        };
        setDetail({ status: 'error', error });
        // An upstream ban lasts as long as it says it does; polling through it
        // cannot succeed and spends budget we want the moment it lifts.
        return error.retryAfterSeconds ?? 30;
      }

      const data = payload as WatchlistDetailDto;
      setDetail({ status: 'ready', data, stale: data.quotesStale });
      return data.refreshAfterSeconds;
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return 60;
      setDetail({
        status: 'error',
        error: {
          error: error instanceof Error ? error.message : 'Network request failed',
          code: 'NETWORK',
        },
      });
      return 30;
    } finally {
      if (mounted.current && !quiet) setIsRefreshing(false);
    }
  }, []);

  const tickRef = useRef<() => Promise<void>>(async () => {});

  const schedule = useCallback((seconds: number) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void tickRef.current();
    }, Math.max(2, seconds) * 1000);
  }, []);

  const tick = useCallback(async () => {
    const id = activeIdRef.current;
    if (id === null) return;
    // A hidden tab must not spend rate-limit budget.
    if (!isVisible()) {
      schedule(20);
      return;
    }
    const next = await loadDetail(id, true);
    if (mounted.current) schedule(next);
  }, [isVisible, loadDetail, schedule]);

  tickRef.current = tick;

  // --- Boot -----------------------------------------------------------------

  useEffect(() => {
    mounted.current = true;

    void (async () => {
      const all = await loadLists();
      if (!mounted.current || all === null) return;
      // Open the default list, falling back to the first. Landing on nothing
      // when watchlists exist is a dead first screen.
      const target = all.find((entry) => entry.isDefault) ?? all[0];
      if (target !== undefined) setActiveId(target.id);
      else setDetail({ status: 'ready', data: emptyDetail(), stale: false });
    })();

    const onVisible = (): void => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current !== null) clearTimeout(timer.current);
      if (layoutTimer.current !== null) clearTimeout(layoutTimer.current);
      abort.current?.abort();
    };
  }, [loadLists, tick]);

  // Switching lists: load immediately and restart the poll.
  useEffect(() => {
    if (activeId === null) return;
    setDetail({ status: 'loading' });
    void (async () => {
      const next = await loadDetail(activeId);
      if (mounted.current) schedule(next);
    })();
  }, [activeId, loadDetail, schedule]);

  const refresh = useCallback(() => {
    void tick();
  }, [tick]);

  // --- Mutations ------------------------------------------------------------

  const reload = useCallback(async () => {
    await loadLists();
    const id = activeIdRef.current;
    if (id !== null) await loadDetail(id, true);
  }, [loadLists, loadDetail]);

  const createList = useCallback(
    async (name: string): Promise<MutationResult<WatchlistSummaryDto>> => {
      const result = await request<{ watchlist: WatchlistSummaryDto }>('/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (!result.ok) return result;
      await loadLists();
      setActiveId(result.data.watchlist.id);
      return { ok: true, data: result.data.watchlist };
    },
    [loadLists],
  );

  const renameList = useCallback(
    async (id: number, name: string) => {
      const result = await request(`/api/watchlists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      if (result.ok) await loadLists();
      return result;
    },
    [loadLists],
  );

  const makeDefault = useCallback(
    async (id: number) => {
      const result = await request(`/api/watchlists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: true }),
      });
      if (result.ok) await loadLists();
      else
        toast({
          variant: 'destructive',
          title: 'Could not set the default list',
          description: result.error.error,
        });
      return result;
    },
    [loadLists, toast],
  );

  const deleteList = useCallback(
    async (id: number) => {
      const result = await request(`/api/watchlists/${id}`, { method: 'DELETE' });
      if (!result.ok) {
        toast({
          variant: 'destructive',
          title: 'Could not delete that watchlist',
          description: result.error.error,
        });
        return result;
      }
      const remaining = await loadLists();
      if (activeIdRef.current === id) {
        const next = remaining?.find((entry) => entry.isDefault) ?? remaining?.[0] ?? null;
        setActiveId(next?.id ?? null);
        if (next === undefined || next === null) {
          setDetail({ status: 'ready', data: emptyDetail(), stale: false });
        }
      }
      return result;
    },
    [loadLists, toast],
  );

  const reorderLists = useCallback(
    async (ids: readonly number[]) => {
      // Optimistic: a drag that snaps back while the request flies reads as a
      // failed drag even when it succeeded.
      setLists((current) =>
        current.status === 'ready'
          ? {
              ...current,
              data: [...current.data].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)),
            }
          : current,
      );
      const result = await request('/api/watchlists/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      // Reconcile to the server's order on failure, so the optimistic reorder
      // cannot linger as a lie — and say what happened.
      if (!result.ok) {
        await loadLists();
        toast({
          variant: 'destructive',
          title: 'Could not save the new order',
          description: result.error.error,
        });
      }
      return result;
    },
    [loadLists, toast],
  );

  const addSymbols = useCallback(
    async (symbols: readonly string[]) => {
      const id = activeIdRef.current;
      if (id === null) {
        return { ok: false as const, error: { error: 'No watchlist selected.', code: 'NO_LIST' } };
      }
      const result = await request<{
        added: readonly string[];
        duplicates: readonly string[];
        unknown: readonly string[];
      }>(`/api/watchlists/${id}/items`, { method: 'POST', body: JSON.stringify({ symbols }) });
      if (result.ok) await reload();
      return result;
    },
    [reload],
  );

  const removeSymbols = useCallback(
    async (instrumentIds: readonly number[]) => {
      const id = activeIdRef.current;
      if (id === null) {
        return { ok: false as const, error: { error: 'No watchlist selected.', code: 'NO_LIST' } };
      }
      // Optimistic removal — the row disappears on click, as a delete should.
      setDetail((current) =>
        current.status === 'ready'
          ? {
              ...current,
              data: {
                ...current.data,
                rows: current.data.rows.filter((row) => !instrumentIds.includes(row.instrumentId)),
              },
            }
          : current,
      );
      const result = await request(`/api/watchlists/${id}/items`, {
        method: 'DELETE',
        body: JSON.stringify({ instrumentIds }),
      });
      // `reload()` restores the optimistically-removed rows on failure; the
      // toast is the only thing that tells the user the click did not take.
      await reload();
      if (!result.ok) {
        toast({
          variant: 'destructive',
          title:
            instrumentIds.length > 1
              ? 'Could not remove those stocks'
              : 'Could not remove that stock',
          description: result.error.error,
        });
      }
      return result;
    },
    [reload, toast],
  );

  /** Adds to a list that is not the one on screen — the "add to another" action. */
  const addSymbolsTo = useCallback(
    async (watchlistId: number, symbols: readonly string[]) => {
      const result = await request(`/api/watchlists/${watchlistId}/items`, {
        method: 'POST',
        body: JSON.stringify({ symbols }),
      });
      // This list is off-screen, so the action is invisible without a toast —
      // confirm the success by name, and surface a failure the same way.
      const name = listsRef.current.find((entry) => entry.id === watchlistId)?.name;
      const target = name === undefined ? 'the list' : `“${name}”`;
      if (result.ok) {
        await loadLists();
        toast({
          variant: 'success',
          title: `Added to ${target}`,
          description: symbols.join(', '),
        });
      } else {
        toast({
          variant: 'destructive',
          title: `Could not add to ${target}`,
          description: result.error.error,
        });
      }
      return result;
    },
    [loadLists, toast],
  );

  /**
   * Applies a layout locally at once, and persists it on a trailing debounce.
   *
   * Every column toggle would otherwise be its own round trip, and dragging a
   * column across ten positions would be ten writes of state that was never on
   * screen for more than a frame.
   */
  const setLayout = useCallback((layout: WatchlistLayoutDto) => {
    const id = activeIdRef.current;
    if (id === null) return;

    setDetail((current) =>
      current.status === 'ready' ? { ...current, data: { ...current.data, layout } } : current,
    );

    if (layoutTimer.current !== null) clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(() => {
      void request(`/api/watchlists/${id}/layout`, {
        method: 'PUT',
        body: JSON.stringify(layout),
      });
    }, LAYOUT_SAVE_DEBOUNCE_MS);
  }, []);

  const saveView = useCallback(
    async (input: {
      name: string;
      global: boolean;
      columns: readonly string[];
      sort: WatchlistLayoutDto['sort'];
      filters: WatchlistLayoutDto['filters'];
    }) => {
      const id = activeIdRef.current;
      if (id === null) {
        return { ok: false as const, error: { error: 'No watchlist selected.', code: 'NO_LIST' } };
      }
      const result = await request<{ view: SavedViewDto }>(`/api/watchlists/${id}/views`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (result.ok) await loadDetail(id, true);
      return result;
    },
    [loadDetail],
  );

  const deleteView = useCallback(
    async (viewId: number) => {
      const id = activeIdRef.current;
      if (id === null) {
        return { ok: false as const, error: { error: 'No watchlist selected.', code: 'NO_LIST' } };
      }
      const result = await request(`/api/watchlists/${id}/views/${viewId}`, { method: 'DELETE' });
      if (result.ok) await loadDetail(id, true);
      else
        toast({
          variant: 'destructive',
          title: 'Could not delete that view',
          description: result.error.error,
        });
      return result;
    },
    [loadDetail, toast],
  );

  return {
    lists,
    detail,
    activeId,
    isRefreshing,
    setActiveId,
    refresh,
    createList,
    renameList,
    deleteList,
    makeDefault,
    reorderLists,
    addSymbols,
    addSymbolsTo,
    removeSymbols,
    setLayout,
    saveView,
    deleteView,
  };
}

/** The shape rendered when no watchlist exists at all. */
function emptyDetail(): WatchlistDetailDto {
  return {
    watchlist: {
      id: 0,
      name: '',
      position: 0,
      isDefault: false,
      count: 0,
      updatedAt: new Date().toISOString(),
    },
    rows: [],
    layout: { columns: [], sort: [], filters: {}, quickView: null },
    savedViews: [],
    market: { isOpen: false, phase: 'unknown' },
    fetchedAt: new Date().toISOString(),
    missingQuotes: [],
    quotesStale: false,
    refreshAfterSeconds: 300,
  };
}
