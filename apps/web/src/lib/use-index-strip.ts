'use client';

import { listingKey } from '@equitywise/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ROUTES } from './api-routes';
import type { IndexSnapshotDto, IndexStripDto, MarketErrorDto } from './market-types';
import type { LiveBatchDto, LiveQuoteDto, LiveSourceState } from './watchlist-types';

/**
 * Data for the market indices strip.
 *
 * Two feeds, like the watchlist page:
 *
 *   snapshot  `GET /api/market/indices` — levels, O/H/L/previous close and the
 *             session phase. Polled slowly: it exists to refresh the parts a
 *             tick does not carry.
 *   live      `GET /api/market/indices/live` — the level, as it prints, while
 *             the session is live and the tab is visible.
 *
 * The last snapshot is kept at module level so the strip paints instantly if
 * it is ever remounted (a full navigation, a fresh `AppShell`) instead of
 * flashing a skeleton.
 */

export type IndexStripState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: IndexStripDto }
  | { readonly status: 'error'; readonly error: MarketErrorDto };

/** Snapshot cadence while the session prints prices — refreshes O/H/L and the phase. */
const OPEN_POLL_MS = 60_000;
/** Snapshot cadence when it does not — only the session phase can change. */
const CLOSED_POLL_MS = 5 * 60_000;

let cached: IndexStripDto | null = null;

/** Applies live ticks to a snapshot. Same-length array when nothing moved. */
export function applyIndexTicks(
  indices: readonly IndexSnapshotDto[],
  quotes: readonly LiveQuoteDto[],
): readonly IndexSnapshotDto[] {
  if (quotes.length === 0) return indices;
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  let changed = false;
  const next = indices.map((index) => {
    const quote = bySymbol.get(listingKey(index));
    if (quote === undefined || quote.ltp === index.ltp) return index;
    changed = true;
    const previousClose = index.previousClose;
    // Integer paise arithmetic only; the percent is a ratio and may be a float.
    const change = previousClose === null ? index.change : quote.ltp - previousClose;
    const changePercent =
      previousClose === null || previousClose === 0
        ? index.changePercent
        : ((quote.ltp - previousClose) / previousClose) * 100;
    return {
      ...index,
      ltp: quote.ltp,
      change,
      changePercent,
      high: index.high === null ? null : Math.max(index.high, quote.ltp),
      low: index.low === null ? null : Math.min(index.low, quote.ltp),
      at: quote.at,
    };
  });
  return changed ? next : indices;
}

export function useIndexStrip(): {
  readonly state: IndexStripState;
  readonly liveState: LiveSourceState | null;
  readonly refresh: () => void;
} {
  const [state, setState] = useState<IndexStripState>(() =>
    cached === null ? { status: 'loading' } : { status: 'ready', data: cached },
  );
  const [liveState, setLiveState] = useState<LiveSourceState | null>(null);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async (): Promise<number> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    let delay = CLOSED_POLL_MS;
    try {
      const response = await fetch(API_ROUTES.marketIndices, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const body = (await response.json()) as IndexStripDto | MarketErrorDto;
      if (!mounted.current) return delay;

      if (!response.ok) {
        const error = body as MarketErrorDto;
        // Keep showing the last snapshot through a fault; only a first load
        // with nothing to show becomes an error state.
        setState((current) => (current.status === 'ready' ? current : { status: 'error', error }));
        if (error.retryAfterSeconds !== undefined) delay = error.retryAfterSeconds * 1000;
        return delay;
      }

      const data = body as IndexStripDto;
      cached = data;
      setState({ status: 'ready', data });
      const printing = data.market.phase === 'open' || data.market.phase === 'pre_open';
      delay = printing ? OPEN_POLL_MS : CLOSED_POLL_MS;
      return delay;
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return delay;
      if (mounted.current) {
        setState((current) =>
          current.status === 'ready'
            ? current
            : { status: 'error', error: { error: 'Could not reach the server.' } },
        );
      }
      return delay;
    }
  }, []);

  const schedule = useCallback(
    (delay: number): void => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (document.hidden) {
          schedule(delay);
          return;
        }
        void load().then(schedule);
      }, delay);
    },
    [load],
  );

  useEffect(() => {
    mounted.current = true;
    void load().then(schedule);

    const onVisible = (): void => {
      if (!document.hidden) void load().then(schedule);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current !== null) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, [load, schedule]);

  // --- Live levels ------------------------------------------------------------

  const phase = state.status === 'ready' ? state.data.market.phase : null;
  const wantsLive = phase === 'open' || phase === 'pre_open';

  useEffect(() => {
    if (!wantsLive || typeof EventSource === 'undefined') {
      setLiveState(null);
      return;
    }

    let source: EventSource | null = null;

    const open = (): void => {
      if (source !== null) return;
      source = new EventSource(API_ROUTES.marketIndicesLive);
      source.onmessage = (event: MessageEvent<string>) => {
        let batch: LiveBatchDto;
        try {
          batch = JSON.parse(event.data) as LiveBatchDto;
        } catch {
          return;
        }
        setLiveState(batch.state);
        if (batch.quotes.length === 0) return;
        setState((current) => {
          if (current.status !== 'ready') return current;
          const indices = applyIndexTicks(current.data.indices, batch.quotes);
          if (indices === current.data.indices) return current;
          const data = { ...current.data, indices };
          cached = data;
          return { status: 'ready', data };
        });
      };
      // The browser reconnects on its own; stop claiming "live" meanwhile.
      source.onerror = () => setLiveState(null);
    };

    const close = (): void => {
      source?.close();
      source = null;
      setLiveState(null);
    };

    const onVisibility = (): void => {
      if (document.hidden) close();
      else open();
    };

    if (!document.hidden) open();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      close();
    };
  }, [wantsLive]);

  const refresh = useCallback((): void => {
    void load().then(schedule);
  }, [load, schedule]);

  return { state, liveState, refresh };
}
