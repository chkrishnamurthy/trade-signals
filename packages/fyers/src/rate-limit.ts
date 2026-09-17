import {
  type RateLimits,
  RateLimiter as TokenBucket,
  type TokenBucketOptions,
} from '@equitywise/shared';

/**
 * Fyers' rate limits over the shared token bucket.
 *
 * The v3 docs publish 10/sec, 200/min and 1,00,000/day for non-transactional
 * APIs. We default to roughly half of each, for two documented reasons and one
 * empirical one:
 *
 *   - Exceeding the per-minute limit more than three times in a day gets the
 *     user "blocked for the rest of the day" (v3 spec, "User blocking"). The
 *     downside of being slightly slow is nothing; the downside of being blocked
 *     is losing a trading day.
 *   - The limits are account-wide, not per-process. Anything else touching the
 *     account spends from the same budget.
 *   - The community consistently reports 429s well below the published ceiling.
 */

export type { RateLimits, TokenBucketOptions };

/** Limits exactly as published in the v3 documentation. */
export const DOCUMENTED_LIMITS = {
  perSecond: 10,
  perMinute: 200,
  perDay: 100_000,
} as const;

/** What we actually run at: about half of documented. */
export const DEFAULT_LIMITS = {
  perSecond: 5,
  perMinute: 100,
  perDay: 50_000,
} as const;

/** The shared bucket, defaulting to Fyers' limits when none are given. */
export class RateLimiter extends TokenBucket {
  constructor(options: Partial<TokenBucketOptions> = {}) {
    super({ ...options, limits: options.limits ?? DEFAULT_LIMITS });
  }
}
