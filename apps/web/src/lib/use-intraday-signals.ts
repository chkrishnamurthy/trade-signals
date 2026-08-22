'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntradayFeedDto, IntradaySignalDto } from './intraday-types';
import type { MarketErrorDto } from './market-types';

/**
 * The intraday signals feed.
 *
 * Polls a database-backed route rather than a market-data one: the engine runs
 * in the worker and has already paid the provider's rate-limit cost, so this
 * poll is a handful of indexed reads and can run at 30 seconds without any of
 * the budget arithmetic the dashboard's quote poll needs.
 *
 * The server dictates the interval, because only it knows whether the market
 * is open. A hidden tab backs off — nobody is reading it, and a signals page
 * left open overnight should not hold a connection warm all night.
 */

export type Feed<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: MarketErrorDto };

export function useIntradaySignals() {
  const [feed, setFeed] = useState<Feed<IntradayFeedDto>>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const tickRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async (): Promise<number> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setIsRefreshing(true);

    try {
      const response = await fetch('/api/intraday-signals', {
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload: unknown = await response.json();
      if (!mounted.current) return 60;

      if (!response.ok) {
        setFeed({ status: 'error', error: payload as MarketErrorDto });
        return 60;
      }
      const data = payload as IntradayFeedDto;
      setFeed({ status: 'ready', data });
      return data.refreshAfterSeconds;
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return 60;
      setFeed({
        status: 'error',
        error: {
          error: error instanceof Error ? error.message : 'Could not load signals',
          code: 'NETWORK',
        },
      });
      return 30;
    } finally {
      if (mounted.current) setIsRefreshing(false);
    }
  }, []);

  const schedule = useCallback((seconds: number) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void tickRef.current();
    }, Math.max(5, seconds) * 1000);
  }, []);

  const tick = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) {
      schedule(30);
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

  return { feed, refresh, isRefreshing };
}

/**
 * One signal's full detail, including its timeline.
 *
 * Fetched on demand rather than shipped with the list: timelines run to dozens
 * of entries each and are only ever read one signal at a time.
 */
export function useSignalDetail(id: number | null) {
  const [detail, setDetail] = useState<Feed<IntradaySignalDto>>({ status: 'loading' });

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    const controller = new AbortController();
    setDetail({ status: 'loading' });

    void (async () => {
      try {
        const response = await fetch(`/api/intraday-signals/${id}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const payload: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setDetail({ status: 'error', error: payload as MarketErrorDto });
          return;
        }
        setDetail({ status: 'ready', data: payload as IntradaySignalDto });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setDetail({
          status: 'error',
          error: {
            error: error instanceof Error ? error.message : 'Could not load the analysis',
            code: 'NETWORK',
          },
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  return detail;
}
