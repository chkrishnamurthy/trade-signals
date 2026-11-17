'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A CSS media query, live.
 *
 * `false` on the server and on the first client frame, so markup never
 * mismatches: a component that branches on this renders its wide-screen form
 * first and swaps after hydration. Use it only where CSS cannot do the job —
 * where the two forms are different components (a menu and a sheet), not the
 * same one restyled.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', listener);
      return () => list.removeEventListener('change', listener);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below Tailwind's `sm` (640px): a phone held upright. */
export const PHONE_QUERY = '(width < 40rem)';

/**
 * True on a phone-width screen. Menus and panels open as a bottom sheet there
 * and as a popover everywhere else (`AdaptivePopover`, the account menu).
 */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
