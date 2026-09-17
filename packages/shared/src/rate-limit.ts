/**
 * Token-bucket rate limiting.
 *
 * Three windows in series — per-second, per-minute and per-day — because that
 * is how every broker publishes its limits. A request must take a token from
 * all three. Refill is continuous rather than on a fixed boundary, so a burst
 * at the end of one window cannot immediately be followed by another burst at
 * the start of the next.
 *
 * The limits are an argument, not a constant: each provider package wraps this
 * with its own documented numbers (see `@equitywise/fyers` `DEFAULT_LIMITS`).
 * Provider-neutral, so every provider shares one implementation.
 */

export interface RateLimits {
  readonly perSecond: number;
  readonly perMinute: number;
  readonly perDay: number;
}

export interface TokenBucketOptions {
  /** Required here; a provider package supplies its own documented defaults. */
  readonly limits: RateLimits;
  /** Injectable clock, in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Injectable sleep. Defaults to `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
}

interface Window {
  readonly capacity: number;
  readonly intervalMs: number;
  tokens: number;
  lastRefill: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Three token buckets in series — per-second, per-minute and per-day.
 *
 * A request must take a token from all three. Refill is continuous rather than
 * on a fixed boundary, so a burst at the end of one window cannot immediately
 * be followed by another burst at the start of the next.
 */
export class RateLimiter {
  private readonly windows: Window[];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Serialises waiters so they cannot all wake and overshoot together. */
  private queue: Promise<void> = Promise.resolve();

  constructor(options: TokenBucketOptions) {
    const limits = options.limits;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;

    const start = this.now();
    this.windows = [
      {
        capacity: limits.perSecond,
        intervalMs: 1_000,
        tokens: limits.perSecond,
        lastRefill: start,
      },
      {
        capacity: limits.perMinute,
        intervalMs: 60_000,
        tokens: limits.perMinute,
        lastRefill: start,
      },
      {
        capacity: limits.perDay,
        intervalMs: 86_400_000,
        tokens: limits.perDay,
        lastRefill: start,
      },
    ];
  }

  private refill(): void {
    const now = this.now();
    for (const window of this.windows) {
      const elapsed = now - window.lastRefill;
      if (elapsed <= 0) continue;
      const rate = window.capacity / window.intervalMs;
      window.tokens = Math.min(window.capacity, window.tokens + elapsed * rate);
      window.lastRefill = now;
    }
  }

  /** Milliseconds until every window has at least one token. 0 when ready. */
  private waitMs(): number {
    this.refill();
    let wait = 0;
    for (const window of this.windows) {
      if (window.tokens >= 1) continue;
      const rate = window.capacity / window.intervalMs;
      wait = Math.max(wait, Math.ceil((1 - window.tokens) / rate));
    }
    return wait;
  }

  /** Tokens currently available in each window. Exposed for tests and metrics. */
  available(): { perSecond: number; perMinute: number; perDay: number } {
    this.refill();
    const [second, minute, day] = this.windows;
    return {
      perSecond: Math.floor(second?.tokens ?? 0),
      perMinute: Math.floor(minute?.tokens ?? 0),
      perDay: Math.floor(day?.tokens ?? 0),
    };
  }

  /**
   * Waits until a token is available in every window, then spends one from each.
   *
   * Calls are serialised, so N concurrent callers are admitted one at a time in
   * arrival order rather than all observing the same free slot.
   */
  async acquire(): Promise<void> {
    const admitted = this.queue.then(async () => {
      for (;;) {
        const wait = this.waitMs();
        if (wait <= 0) break;
        await this.sleep(wait);
      }
      for (const window of this.windows) {
        window.tokens -= 1;
      }
    });

    // Keep the chain alive even if a waiter rejects.
    this.queue = admitted.then(
      () => undefined,
      () => undefined,
    );
    return admitted;
  }
}
