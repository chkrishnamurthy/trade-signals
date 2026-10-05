/**
 * Sliding-window hit counter — pure (no clock, no I/O) so it is unit-testable.
 * `request-limit.ts` wires it to the clock and the request.
 */

export interface Bucket {
  hits: number[];
}

export interface WindowLimit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

/** Records a hit at `now` and says whether it is allowed. */
export function hitWindow(
  store: Map<string, Bucket>,
  key: string,
  limit: WindowLimit,
  now: number,
): { allowed: boolean; retryAfterSec: number } {
  const bucket = store.get(key) ?? { hits: [] };
  const cutoff = now - limit.windowMs;
  bucket.hits = bucket.hits.filter((at) => at > cutoff);

  if (bucket.hits.length >= limit.max) {
    const oldest = bucket.hits[0] ?? now;
    store.set(key, bucket);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + limit.windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  store.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
}
