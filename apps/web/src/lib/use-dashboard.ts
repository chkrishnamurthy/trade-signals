'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardDto, SignalsDto } from './dashboard-types';
import type { MarketErrorDto } from './market-types';

/**
 * Dashboard data.
 *
 * Two feeds on deliberately different cadences, because they cost very
 * different amounts upstream:
 *
 *   quotes   two Fyers calls  → polled on the server-dictated interval
 *   signals  fifty calls      → fetched once and refreshed rarely
 *
 * The server dictates the interval rather than the client picking one, because
 * only the server knows whether the upstream has handed us a `Retry-After`.
 *
 * Polling rather than a socket: the Fyers data socket authenticates with
 * `appId:accessToken`, which must never reach the browser, and a server-side
 * socket needs a long-lived process that a Next route handler is not. The seam
 * is this hook — swapping in an EventSource changes nothing for the components.
 */

export type Feed<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; stale: boolean }
  | { status: 'error'; error: MarketErrorDto };

/** Signals are expensive; refresh far less often than quotes. */
const SIGNALS_INTERVAL_MS = 10 * 60_000;

function useVisibility(): () => boolean {
  return useCallback(() => typeof document === 'undefined' || !document.hidden, []);
}

export function useDashboard(indexKey: string) {
  const [dashboard, setDashboard] = useState<Feed<DashboardDto>>({ status: 'loading' });
  const [signals, setSignals] = useState<Feed<SignalsDto>>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const isVisible = useVisibility();

  const loadDashboard = useCallback(async (): Promise<number> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/dashboard/${indexKey}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload: unknown = await response.json();
      if (!mounted.current) return 60;

      if (!response.ok) {
        const error = payload as MarketErrorDto;
        setDashboard({ status: 'error', error });
        // An upstream ban lasts as long as it says it does. Polling through it
        // cannot succeed and spends budget we will want the moment it lifts.
        return error.retryAfterSeconds ?? 30;
      }
      const data = payload as DashboardDto;
      setDashboard({
        status: 'ready',
        data,
        stale: response.headers.get('X-Stale-Reason') !== null,
      });
      return data.refreshAfterSeconds;
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return 60;
      setDashboard({
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

  const loadSignals = useCallback(async () => {
    try {
      const response = await fetch(`/api/signals/${indexKey}`, { cache: 'no-store' });
      const payload: unknown = await response.json();
      if (!mounted.current) return;
      if (!response.ok) {
        setSignals({ status: 'error', error: payload as MarketErrorDto });
        return;
      }
      setSignals({ status: 'ready', data: payload as SignalsDto, stale: false });
    } catch (error) {
      if (!mounted.current) return;
      setSignals({
        status: 'error',
        error: {
          error: error instanceof Error ? error.message : 'Could not load signals',
          code: 'NETWORK',
        },
      });
    }
  }, [indexKey]);

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
    const next = await loadDashboard();
    if (mounted.current) schedule(next);
  }, [isVisible, loadDashboard, schedule]);

  tickRef.current = tick;

  useEffect(() => {
    mounted.current = true;
    void tick();
    void loadSignals();

    signalTimer.current = setInterval(() => {
      if (isVisible()) void loadSignals();
    }, SIGNALS_INTERVAL_MS);

    const onVisible = (): void => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current !== null) clearTimeout(timer.current);
      if (signalTimer.current !== null) clearInterval(signalTimer.current);
      abort.current?.abort();
    };
  }, [tick, loadSignals, isVisible]);

  const refresh = useCallback(() => {
    void tick();
    void loadSignals();
  }, [tick, loadSignals]);

  return { dashboard, signals, refresh, isRefreshing };
}
