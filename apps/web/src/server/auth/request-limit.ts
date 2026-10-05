import 'server-only';
import { NextResponse } from 'next/server';
import { clientIp } from './request';
import { type Bucket, hitWindow, type WindowLimit } from './window-limit';

/**
 * A small in-memory sliding-window limiter for cheap, high-volume public
 * endpoints (symbol search). Unlike `rate-limit.ts` it never touches the
 * database — a Postgres write per keystroke would cost more than the abuse it
 * stops. State is per web process, which is the right scope: it bounds what one
 * client can do to this process and the provider behind it.
 */

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

/** Drops idle keys so an address scan cannot grow the map without bound. */
function prune(now: number, windowMs: number): void {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    const last = bucket.hits[bucket.hits.length - 1];
    if (last === undefined || last <= now - windowMs) buckets.delete(key);
  }
  // Still full of live keys: start over rather than refuse everyone.
  if (buckets.size >= MAX_KEYS) buckets.clear();
}

/** Limits by client address. Returns null to proceed, or a 429 to send. */
export function limitByIp(
  request: Request,
  scope: string,
  limit: WindowLimit,
): NextResponse | null {
  const now = Date.now();
  prune(now, limit.windowMs);
  const key = `${scope}:${clientIp(request) ?? 'unknown'}`;
  const result = hitWindow(buckets, key, limit, now);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: 'Too many requests.', code: 'RATE_LIMITED', remedy: 'Wait a moment and try again.' },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(result.retryAfterSec),
      },
    },
  );
}
