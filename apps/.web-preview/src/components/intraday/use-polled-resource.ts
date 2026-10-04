'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ZodType, ZodTypeDef } from 'zod';
import { redirectToLoginIfUnauthenticated } from '@/lib/session-guard';

export function usePolledResource<T>(
  url: string | null,
  schema: ZodType<T, ZodTypeDef, unknown>,
  paused = false,
) {
  const [result, setResult] = useState<{ url: string; data: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A refresh token intentionally restarts polling on demand.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      let delay = 5000;
      if (document.hidden) {
        timer = setTimeout(() => void poll(), delay);
        return;
      }
      setRefreshing(true);
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (redirectToLoginIfUnauthenticated(response)) return;
        if (!response.ok) {
          const retry = Number(response.headers.get('Retry-After'));
          if (Number.isFinite(retry) && retry > 0) delay = Math.max(delay, retry * 1000);
          const body: unknown = await response.json();
          throw new Error(
            typeof body === 'object' &&
              body !== null &&
              'error' in body &&
              typeof body.error === 'string'
              ? body.error
              : 'Unable to load intraday data.',
          );
        }
        const data = schema.parse(await response.json());
        if (!cancelled) {
          setResult({ url, data });
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load intraday data.');
          delay = Math.max(delay, 30_000);
        }
      } finally {
        if (!cancelled) {
          setRefreshing(false);
          if (!paused) timer = setTimeout(() => void poll(), delay);
        }
      }
    };
    setError(null);
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [url, schema, paused, nonce]);
  return { data: result?.url === url ? result.data : null, error, refreshing, refresh };
}
