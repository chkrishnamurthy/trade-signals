'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketErrorDto, MarketSnapshotDto } from './market-types';

/**
 * Polls the market API.
 *
 * Deliberately a polling hook behind a narrow interface rather than a socket:
 * the Fyers data socket speaks an undocumented binary protocol and needs the
 * access token, which must never reach the browser. When a server-side socket
 * feed lands in apps/worker, only the body of this hook changes — it can switch
 * to an EventSource and every component keeps working.
 *
 * The cadence comes from the server (`refreshAfterSeconds`), so the server
 * alone decides how hard Fyers gets hit, and polling stops entirely when the
 * tab is hidden.
 */

export type MarketState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: MarketSnapshotDto; stale: boolean }
  | { status: 'error'; error: MarketErrorDto };

export interface UseMarketResult {
  readonly state: MarketState;
  /** Fetch immediately, ignoring the schedule. */
  readonly refresh: () => void;
  readonly isRefreshing: boolean;
}

export function useMarket(indexKey: string): UseMarketResult {
  const [state, setState] = useState<MarketState>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/market/${indexKey}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload: unknown = await response.json();

      if (!mounted.current) return 30;

      if (!response.ok) {
        const error = payload as MarketErrorDto;
        setState({ status: 'error', error });
        // Do not hammer a broken upstream.
        return 30;
      }

      const snapshot = payload as MarketSnapshotDto;
      setState({
        status: 'ready',
        snapshot,
        stale: response.headers.get('X-Stale-Reason') !== null,
      });
      return snapshot.refreshAfterSeconds;
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return 30;
      setState({
        status: 'error',
        error: {
          error: error instanceof Error ? error.message : 'Network request failed',
          code: 'NETWORK',
        },
      });
      return 30;
    } finally {
      if (mounted.current) setIsRefreshing(false);
    }
  }, [indexKey]);

  // `schedule` and `tick` are mutually recursive; a ref breaks the cycle so
  // neither needs the other in its dependency array.
  const tickRef = useRef<() => Promise<void>>(async () => {});

  const schedule = useCallback((seconds: number) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void tickRef.current();
    }, Math.max(2, seconds) * 1000);
  }, []);

  const tick = useCallback(async () => {
    // A hidden tab must not spend rate-limit budget.
    if (typeof document !== 'undefined' && document.hidden) {
      schedule(10);
      return;
    }
    const next = await load();
    if (mounted.current) schedule(next);
  }, [load, schedule]);

  tickRef.current = tick;

  useEffect(() => {
    mounted.current = true;
    void tick();

    const onVisible = (): void => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current !== null) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, [tick]);

  const refresh = useCallback(() => {
    void tick();
  }, [tick]);

  return { state, refresh, isRefreshing };
}
