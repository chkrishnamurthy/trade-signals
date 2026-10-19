'use client';

import * as React from 'react';

/**
 * The open tab follows the address (#returns), so a tab can be linked to and the
 * back button behaves. Read through `useSyncExternalStore`, so it is correct on
 * the first client render of a reload or a pasted link, not set a moment after.
 *
 * `ready` is false until the page has hydrated: the server cannot know the
 * address's #fragment, so the caller shows a placeholder until then instead of a
 * tab that is about to change.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('popstate', listener);
  };
}

const readHash = () => window.location.hash.slice(1);
const serverHash = () => '';
const noopSubscribe = () => () => undefined;

export function useHashTab<T extends string>(
  tabs: readonly T[],
  fallback: T,
): { tab: T; ready: boolean; select: (value: string) => void } {
  const hash = React.useSyncExternalStore(subscribe, readHash, serverHash);
  const ready = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const tab = (tabs as readonly string[]).includes(hash) ? (hash as T) : fallback;
  const select = React.useCallback(
    (value: string) => {
      if (!(tabs as readonly string[]).includes(value)) return;
      // replaceState does not fire hashchange; tell this hook's readers ourselves.
      window.history.replaceState(
        null,
        '',
        value === fallback ? window.location.pathname : `#${value}`,
      );
      for (const listener of listeners) listener();
    },
    [tabs, fallback],
  );
  return { tab, ready, select };
}
