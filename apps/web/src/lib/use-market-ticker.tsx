'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { MarketErrorDto } from './market-types';
import type { MarketTickerDto } from './ticker-types';

/**
 * The global market feed.
 *
 * ONE poller for the entire application, mounted by `AppShell` and read through
 * context. Every page renders the ticker, so a per-component hook would mean N
 * concurrent polls of the same endpoint from a single tab.
 *
 * The polling discipline is the dashboard's, for the same reasons: the server
 * dictates the interval because only it knows whether upstream handed us a
 * `Retry-After`, and a hidden tab stops spending rate-limit budget.
 */

export type TickerFeed =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: MarketTickerDto; readonly stale: boolean }
  | { readonly status: 'error'; readonly error: MarketErrorDto };

const MarketTickerContext = createContext<TickerFeed>({ status: 'loading' });

/** The global feed. Returns `loading` outside a provider rather than throwing. */
export function useMarketTicker(): TickerFeed {
  return useContext(MarketTickerContext);
}

export function MarketTickerProvider({ children }: { children: ReactNode }) {
  const [feed, setFeed] = useState<TickerFeed>({ status: 'loading' });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const tickRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async (): Promise<number> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    try {
      const response = await fetch('/api/market/ticker', {
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload: unknown = await response.json();
      if (!mounted.current) return 60;

      if (!response.ok) {
        const error = payload as MarketErrorDto;
        setFeed({ status: 'error', error });
        // An upstream ban lasts as long as it says it does; polling through it
        // cannot succeed and burns budget we want the moment it lifts.
        return error.retryAfterSeconds ?? 60;
      }

      const data = payload as MarketTickerDto;
      setFeed({
        status: 'ready',
        data,
        stale: response.headers.get('X-Stale-Reason') !== null,
      });
      return data.refreshAfterSeconds;
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return 60;
      setFeed({
        status: 'error',
        error: {
          error: error instanceof Error ? error.message : 'Network request failed',
          code: 'NETWORK',
        },
      });
      return 30;
    }
  }, []);

  const schedule = useCallback((seconds: number) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void tickRef.current();
    }, Math.max(2, seconds) * 1000);
  }, []);

  const tick = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) {
      schedule(15);
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

  return <MarketTickerContext.Provider value={feed}>{children}</MarketTickerContext.Provider>;
}
