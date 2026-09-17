import {
  DEFAULT_COOLDOWN_MS,
  PathCircuitBreaker,
  parseRetryAfter,
  RateLimiter,
  type RateLimits,
} from '@equitywise/shared';
import type { z } from 'zod';
import { DHAN_ERROR_CODES, DhanApiError, DhanError, DhanRateLimitError } from './errors.js';
import { envelopeError } from './types.js';

export const DHAN_API_BASE = 'https://api.dhan.co/v2';
export const DHAN_AUTH_BASE = 'https://auth.dhan.co/app';

/**
 * Rate limits, per the v2 docs ("Rate Limits").
 *
 * Dhan publishes two buckets that matter here, and they are counted
 * separately upstream:
 *
 *   Data APIs   (charts, instruments, profile)   5/s · no per-minute cap · 1,00,000/day
 *   Quote APIs  (`/marketfeed/*`)                1/s, 1,000 instruments per call
 *
 * As with Fyers we run below the published ceiling — and for the same
 * empirical reason: a burst of six chart calls at ~4/s earned `HTTP 429`
 * / `DH-904` with no `Retry-After` on 2026-09-16. Dhan does not document a
 * three-strikes day ban, but the account-wide budget is shared with anything
 * else the operator runs, and the cost of being slower is nil.
 */
export const DOCUMENTED_LIMITS = {
  data: { perSecond: 5, perMinute: 300, perDay: 100_000 },
  quote: { perSecond: 1, perMinute: 60, perDay: 86_400 },
} as const satisfies Record<string, RateLimits>;

export const DEFAULT_LIMITS = {
  data: { perSecond: 3, perMinute: 180, perDay: 80_000 },
  // The quote bucket is already the floor; pacing below 1/s would only slow
  // the watchlist for nothing. The client serialises calls, so two callers
  // cannot both land in the same second.
  quote: { perSecond: 1, perMinute: 60, perDay: 86_400 },
} as const satisfies Record<string, RateLimits>;

export type RateBucket = keyof typeof DEFAULT_LIMITS;

/** The Data-API limiter, with Dhan's defaults. */
export function createDataRateLimiter(limits: RateLimits = DEFAULT_LIMITS.data): RateLimiter {
  return new RateLimiter({ limits });
}

/** The Quote-API limiter, with Dhan's defaults. */
export function createQuoteRateLimiter(limits: RateLimits = DEFAULT_LIMITS.quote): RateLimiter {
  return new RateLimiter({ limits });
}

export interface BackoffOptions {
  /** Total attempts including the first. Default 6. */
  readonly attempts?: number;
  /** Delay before the second attempt; doubles thereafter. Default 1000ms. */
  readonly baseDelayMs?: number;
  /** Ceiling on any single delay. Default 30s. */
  readonly maxDelayMs?: number;
}

export interface HttpClientOptions {
  /** Shared per account: Dhan counts the Data budget across every process. */
  readonly dataRateLimiter?: RateLimiter;
  readonly quoteRateLimiter?: RateLimiter;
  /** Shared with every client for the same account; bans outlive a credential. */
  readonly circuitBreaker?: PathCircuitBreaker;
  readonly backoff?: BackoffOptions;
  /** Injectable for tests. Defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Called on every backoff, for logging. */
  readonly onRetry?: (info: {
    attempt: number;
    delayMs: number;
    status: number | undefined;
    reason: string;
  }) => void;
  /** Per-request timeout. Default 30s. */
  readonly timeoutMs?: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Full-jitter exponential backoff: uniform in [ceiling/2, ceiling]. */
export function backoffDelay(
  attempt: number,
  options: BackoffOptions = {},
  random = Math.random,
): number {
  const { baseDelayMs = 1_000, maxDelayMs = 30_000 } = options;
  const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

/**
 * True when a response should be retried rather than surfaced.
 *
 * 429 is deliberately absent: the ban is fixed-duration and handled by the
 * circuit breaker. 4xx are decisions (bad token, bad input, not subscribed)
 * and retrying them cannot change the answer.
 */
function isRetryableStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly query?: Record<string, string | number | undefined>;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** Which upstream budget this call spends from. Default `data`. */
  readonly bucket?: RateBucket;
  /** Skips rate limiting. Only for the scrip-master CDN, which has none. */
  readonly skipRateLimit?: boolean;
}

/**
 * The single HTTP path out of this package.
 *
 * Every call is rate limited before it leaves, from the bucket its path
 * belongs to. Transport blips and 5xx are retried with jitter; 429 and
 * `DH-904` are not — the path is short-circuited until the ban expires.
 */
export class DhanHttpClient {
  private readonly limiters: Record<RateBucket, RateLimiter>;
  private readonly circuit: PathCircuitBreaker;
  private readonly backoff: BackoffOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onRetry: HttpClientOptions['onRetry'];
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions = {}) {
    this.limiters = {
      data: options.dataRateLimiter ?? createDataRateLimiter(),
      quote: options.quoteRateLimiter ?? createQuoteRateLimiter(),
    };
    this.circuit = options.circuitBreaker ?? new PathCircuitBreaker();
    this.backoff = options.backoff ?? {};
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.onRetry = options.onRetry;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** Throws without touching the network when `path` is still banned. */
  private assertPathUsable(path: string): void {
    const waitMs = this.circuit.retryAfterMs(path);
    if (waitMs <= 0) return;
    throw new DhanRateLimitError(
      `${path} is rate limited upstream for another ${Math.ceil(waitMs / 1000)}s`,
      0,
      { code: DHAN_ERROR_CODES.RATE_LIMITED, retryAfterMs: waitMs },
    );
  }

  /** Opens the breaker for `path` and raises the matching error. */
  private tripAndThrow(
    path: string,
    attempt: number,
    reason: string,
    retryAfterHeader?: string | null,
  ): never {
    const waitMs = parseRetryAfter(retryAfterHeader) ?? DEFAULT_COOLDOWN_MS;
    this.circuit.trip(path, waitMs);
    throw new DhanRateLimitError(reason, attempt, {
      code: DHAN_ERROR_CODES.RATE_LIMITED,
      retryAfterMs: waitMs,
    });
  }

  /** Milliseconds until `path` is usable, 0 if it is usable now. */
  cooldownMs(path: string): number {
    return this.circuit.retryAfterMs(path);
  }

  private async acquire(options: RequestOptions): Promise<void> {
    if (options.skipRateLimit === true) return;
    await this.limiters[options.bucket ?? 'data'].acquire();
  }

  /**
   * Fetches a plain-text body (the scrip-master CSV), with the same backoff
   * as JSON requests but no envelope parsing.
   */
  async requestText(url: string, options: RequestOptions = {}): Promise<string> {
    const attempts = this.backoff.attempts ?? 6;
    const path = new URL(url).pathname;
    let lastReason = 'unknown';
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      this.assertPathUsable(path);
      await this.acquire(options);

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const response = await this.fetchImpl(url, {
            method: options.method ?? 'GET',
            headers: { Accept: 'text/csv,text/plain,*/*', ...options.headers },
            signal: controller.signal,
          });
          lastStatus = response.status;
          if (response.ok) return await response.text();
          lastReason = `HTTP ${response.status}`;
          if (response.status === 429) {
            this.tripAndThrow(path, attempt, lastReason, response.headers.get('retry-after'));
          }
          if (!isRetryableStatus(response.status)) {
            throw new DhanApiError(lastReason, { httpStatus: response.status });
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        if (error instanceof DhanError) throw error;
        lastReason = error instanceof Error ? error.message : String(error);
      }

      if (attempt === attempts) break;
      const delayMs = backoffDelay(attempt, this.backoff);
      this.onRetry?.({ attempt, delayMs, status: lastStatus, reason: lastReason });
      await this.sleep(delayMs);
    }

    throw new DhanApiError(`Request failed after ${attempts} attempts: ${lastReason}`, {
      httpStatus: lastStatus,
    });
  }

  /** Issues a request and parses the body with `schema`. */
  async request<T>(url: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
    const attempts = this.backoff.attempts ?? 6;
    let lastReason = 'unknown';
    let lastStatus: number | undefined;

    const target = new URL(url);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) target.searchParams.set(key, String(value));
    }
    const path = target.pathname;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      this.assertPathUsable(path);
      await this.acquire(options);

      let status: number | undefined;
      let payload: unknown;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const response = await this.fetchImpl(target.toString(), {
            method: options.method ?? 'GET',
            headers: {
              Accept: 'application/json',
              ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
              ...options.headers,
            },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
            signal: controller.signal,
          });
          status = response.status;
          lastStatus = status;

          const text = await response.text();
          payload = text === '' ? {} : safeJsonParse(text);

          if (!response.ok) {
            const failure = envelopeError(payload);
            lastReason = `HTTP ${status}: ${failure?.message ?? text.slice(0, 200)}`;
            if (status === 429 || failure?.code === DHAN_ERROR_CODES.RATE_LIMITED) {
              this.tripAndThrow(path, attempt, lastReason, response.headers.get('retry-after'));
            }
            if (!isRetryableStatus(status)) {
              throw new DhanApiError(lastReason, { httpStatus: status, code: failure?.code });
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        // Rate-limit and API errors are decisions, not blips; never retry them.
        if (error instanceof DhanError) throw error;
        lastReason = error instanceof Error ? error.message : String(error);
        payload = undefined;
      }

      if (payload !== undefined && (status === undefined || status < 400)) {
        // Some data endpoints answer 200 with `status: "failure"` in the body.
        const failure = envelopeError(payload);
        if (failure === null) return parseOrThrow(schema, payload, redactedUrl(target));
        if (failure.code === DHAN_ERROR_CODES.RATE_LIMITED) {
          this.tripAndThrow(path, attempt, `API code ${failure.code} (rate limited)`);
        }
        throw new DhanApiError(failure.message ?? `Dhan returned code ${failure.code ?? '?'}`, {
          httpStatus: status,
          code: failure.code,
        });
      }

      if (attempt === attempts) break;

      const delayMs = backoffDelay(attempt, this.backoff);
      this.onRetry?.({ attempt, delayMs, status: lastStatus, reason: lastReason });
      await this.sleep(delayMs);
    }

    throw new DhanApiError(`Request failed after ${attempts} attempts: ${lastReason}`, {
      httpStatus: lastStatus,
    });
  }
}

/**
 * The URL as it may appear in an error or a log: origin and path only.
 *
 * The auth endpoint carries the PIN and the TOTP code as query parameters.
 * They must never reach a log line, a stack trace, or an operator's terminal.
 */
export function redactedUrl(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { status: 'failure', errorMessage: text.slice(0, 200) };
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown, url: string): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    // A glimpse of the body, so an unrecognised 200 can be diagnosed from the
    // log alone. Bodies never carry credentials; URLs are redacted above.
    const glimpse = JSON.stringify(payload)?.slice(0, 200) ?? '';
    throw new DhanApiError(`Unexpected response shape from ${url} — ${detail} — body ${glimpse}`);
  }
  return parsed.data;
}

/** What every authenticated call needs. Resolved per request so rotation is transparent. */
export interface DhanSession {
  readonly clientId: string;
  readonly accessToken: string;
}

/** The two headers Dhan authenticates with. */
export function authHeaders(session: DhanSession): Record<string, string> {
  return { 'access-token': session.accessToken, 'client-id': session.clientId };
}
