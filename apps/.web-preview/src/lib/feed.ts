import type { MarketErrorDto } from './market-types';

/**
 * A polled feed's state: loading, an error the UI can render, or ready data
 * that may be a stale snapshot. One shape for every client hook that fetches.
 */
export type Feed<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T; readonly stale: boolean }
  | { readonly status: 'error'; readonly error: MarketErrorDto };
