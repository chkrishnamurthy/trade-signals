/**
 * A cap on how many long-lived streams one key (a user) may hold at once.
 *
 * Pure (no clock, no I/O) so it is unit-testable; `live-quotes` streams wire it
 * to the request. A stream costs the process a subscription for as long as it is
 * open, so without a cap one account opening tabs in a loop could hold them all.
 *
 * State is per web process, like the request limiter — it bounds what one
 * account can do to this process.
 */

export interface SlotPool {
  /**
   * Takes a slot for `key`. Returns the function that gives it back, or null
   * when the key already holds the maximum. Releasing twice is harmless: the
   * second call does nothing, so every teardown path may call it.
   */
  acquire(key: string): (() => void) | null;
  /** Slots `key` holds right now. */
  held(key: string): number;
}

export function createSlotPool(maxPerKey: number): SlotPool {
  const counts = new Map<string, number>();

  return {
    acquire(key) {
      const current = counts.get(key) ?? 0;
      if (current >= maxPerKey) return null;
      counts.set(key, current + 1);

      let released = false;
      return () => {
        if (released) return;
        released = true;
        const next = (counts.get(key) ?? 1) - 1;
        // Drop empty keys so the map does not grow with every user ever seen.
        if (next <= 0) counts.delete(key);
        else counts.set(key, next);
      };
    },
    held(key) {
      return counts.get(key) ?? 0;
    },
  };
}
