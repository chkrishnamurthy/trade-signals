'use client';
import { useCallback, useState } from 'react';
import type { ZodType, ZodTypeDef } from 'zod';
import { redirectToLoginIfUnauthenticated } from '@/lib/session-guard';
import { idempotencyKey } from './format';

/**
 * One JSON mutation against `/api/paper/*`, with an idempotency key minted per
 * call so a retried click cannot apply twice. Errors are the server's plain
 * sentence; the caller decides where to show it.
 */
export function usePaperMutation<T>(schema: ZodType<T, ZodTypeDef, unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (
      url: string,
      method: 'PUT' | 'POST',
      body: Record<string, unknown>,
    ): Promise<T | null> => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, idempotencyKey: idempotencyKey() }),
          cache: 'no-store',
        });
        if (redirectToLoginIfUnauthenticated(response)) return null;
        const json: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof json === 'object' &&
            json !== null &&
            'error' in json &&
            typeof json.error === 'string'
              ? json.error
              : 'The change could not be saved.';
          setError(message);
          return null;
        }
        return schema.parse(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The change could not be saved.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [schema],
  );
  return { run, busy, error, clearError: () => setError(null) };
}
