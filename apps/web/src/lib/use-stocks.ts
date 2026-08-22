'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketErrorDto } from './market-types';
import type { StocksDto, StockTechnicalsDto } from './stocks-types';
import type { Feed } from './use-dashboard';

/**
 * The stocks list, on the same two-feed contract as the dashboard.
 *
 *   quotes      cheap, composed from cached snapshots → server-dictated interval
 *   technicals  one history call per symbol           → refreshed rarely
 *
 * Same reasoning as `useDashboard`: the server picks the poll interval because
 * only it knows whether the upstream handed us a `Retry-After`, and a hidden tab
 * must not spend rate-limit budget. The technicals feed failing is survivable —
 * the table still renders every quote column — so it is kept in its own state
 * and never promoted to a page-level error.
 */

/** Indicators are expensive and change once a day; refresh far less often. */
const TECHNICALS_INTERVAL_MS = 10 * 60_000;

export function useStocks() {
  const [stocks, setStocks] = useState<Feed<StocksDto>>({ status: 'loading' });
  const [technicals, setTechnicals] = useState<Feed<StockTechnicalsDto>>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const technicalsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const isVisible = useCallback(() => typeof document === 'undefined' || !document.hidden, []);

  const loadStocks = useCallback(async (): Promise<number> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setIsRefreshing(true);

    try {
      const response = await fetch('/api/stocks', {
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload: unknown = await response.json();
      if (!mounted.current) return 60;

      if (!response.ok) {
        const error = payload as MarketErrorDto;
        setStocks({ status: 'error', error });
        // An upstream ban lasts as long as it says it does. Polling through it
        // cannot succeed and spends budget we will want the moment it lifts.
        return error.retryAfterSeconds ?? 30;
      }

      const data = payload as StocksDto;
      setStocks({ status: 'ready', data, stale: false });
      return data.refreshAfterSeconds;
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return 60;
      setStocks({
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
  }, []);

  const loadTechnicals = useCallback(async () => {
    try {
      const response = await fetch('/api/stocks/technicals', { cache: 'no-store' });
      const payload: unknown = await response.json();
      if (!mounted.current) return;
      if (!response.ok) {
        setTechnicals({ status: 'error', error: payload as MarketErrorDto });
        return;
      }
      setTechnicals({ status: 'ready', data: payload as StockTechnicalsDto, stale: false });
    } catch (error) {
      if (!mounted.current) return;
      setTechnicals({
        status: 'error',
        error: {
          error: error instanceof Error ? error.message : 'Could not load indicators',
          code: 'NETWORK',
        },
      });
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
    // A hidden tab must not spend rate-limit budget.
    if (!isVisible()) {
      schedule(15);
      return;
    }
    const next = await loadStocks();
    if (mounted.current) schedule(next);
  }, [isVisible, loadStocks, schedule]);

  tickRef.current = tick;

  useEffect(() => {
    mounted.current = true;
    void tick();
    void loadTechnicals();

    technicalsTimer.current = setInterval(() => {
      if (isVisible()) void loadTechnicals();
    }, TECHNICALS_INTERVAL_MS);

    const onVisible = (): void => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current !== null) clearTimeout(timer.current);
      if (technicalsTimer.current !== null) clearInterval(technicalsTimer.current);
      abort.current?.abort();
    };
  }, [tick, loadTechnicals, isVisible]);

  const refresh = useCallback(() => {
    void tick();
    void loadTechnicals();
  }, [tick, loadTechnicals]);

  return { stocks, technicals, refresh, isRefreshing };
}
