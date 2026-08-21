import type { z } from 'zod';
import { FYERS_ERROR_CODES, FyersApiError, FyersRateLimitError } from './errors.js';
import { RateLimiter } from './rate-limit.js';
import { fyersEnvelopeSchema } from './types.js';

export const FYERS_API_BASE = 'https://api-t1.fyers.in';
export const FYERS_DATA_BASE = `${FYERS_API_BASE}/data`;
export const FYERS_V3_BASE = `${FYERS_API_BASE}/api/v3`;

export interface BackoffOptions {
  /** Total attempts including the first. Default 6. */
  readonly attempts?: number;
  /** Delay before the second attempt; doubles thereafter. Default 1000ms. */
  readonly baseDelayMs?: number;
  /** Ceiling on any single delay. Default 30s. */
  readonly maxDelayMs?: number;
}

export interface HttpClientOptions {
  readonly rateLimiter?: RateLimiter;
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

/** True when a response should be retried rather than surfaced. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly query?: Record<string, string | number | undefined>;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** Skips the rate limiter. Only for the symbol-master CDN, which is not rate limited. */
  readonly skipRateLimit?: boolean;
}

/**
 * The single HTTP path out of this package.
 *
 * Every call is rate limited before it leaves, and 429 is treated as an
 * expected control signal — backed off and retried with jitter, never thrown
 * on the first occurrence.
 */
export class FyersHttpClient {
  private readonly rateLimiter: RateLimiter;
  private readonly backoff: BackoffOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onRetry: HttpClientOptions['onRetry'];
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions = {}) {
    this.rateLimiter = options.rateLimiter ?? new RateLimiter();
    this.backoff = options.backoff ?? {};
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.onRetry = options.onRetry;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /**
   * Fetches a plain-text body (the symbol-master CSV), with the same rate
   * limiting and backoff as JSON requests but no envelope parsing.
   */
  async requestText(url: string, options: RequestOptions = {}): Promise<string> {
    const attempts = this.backoff.attempts ?? 6;
    let lastReason = 'unknown';
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (options.skipRateLimit !== true) {
        await this.rateLimiter.acquire();
      }

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
          if (!isRetryableStatus(response.status)) {
            throw new FyersApiError(lastReason, { httpStatus: response.status });
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        if (error instanceof FyersApiError) throw error;
        lastReason = error instanceof Error ? error.message : String(error);
      }

      if (attempt === attempts) break;
      const delayMs = backoffDelay(attempt, this.backoff);
      this.onRetry?.({ attempt, delayMs, status: lastStatus, reason: lastReason });
      await this.sleep(delayMs);
    }

    if (lastStatus === 429) {
      throw new FyersRateLimitError(
        `Rate limited after ${attempts} attempts: ${lastReason}`,
        attempts,
        { code: FYERS_ERROR_CODES.RATE_LIMITED },
      );
    }
    throw new FyersApiError(`Request failed after ${attempts} attempts: ${lastReason}`, {
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

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (options.skipRateLimit !== true) {
        await this.rateLimiter.acquire();
      }

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
            lastReason = `HTTP ${status}: ${text.slice(0, 200)}`;
            if (!isRetryableStatus(status)) {
              throw new FyersApiError(lastReason, {
                httpStatus: status,
                code: envelopeCode(payload),
              });
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (error) {
        if (error instanceof FyersApiError) throw error;
        lastReason = error instanceof Error ? error.message : String(error);
        payload = undefined;
      }

      if (payload !== undefined && (status === undefined || status < 400)) {
        const code = envelopeCode(payload);
        // The API also signals rate limiting in-band with a 200 body.
        if (code !== FYERS_ERROR_CODES.RATE_LIMITED) {
          return parseOrThrow(schema, payload, target.toString());
        }
        lastReason = `API code ${code} (rate limited)`;
        lastStatus = 429;
      }

      if (attempt === attempts) break;

      const delayMs = backoffDelay(attempt, this.backoff);
      this.onRetry?.({ attempt, delayMs, status: lastStatus, reason: lastReason });
      await this.sleep(delayMs);
    }

    if (lastStatus === 429) {
      throw new FyersRateLimitError(
        `Rate limited after ${attempts} attempts: ${lastReason}`,
        attempts,
        { code: FYERS_ERROR_CODES.RATE_LIMITED },
      );
    }
    throw new FyersApiError(`Request failed after ${attempts} attempts: ${lastReason}`, {
      httpStatus: lastStatus,
    });
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { s: 'error', message: text.slice(0, 200) };
  }
}

function envelopeCode(payload: unknown): number | undefined {
  const parsed = fyersEnvelopeSchema.safeParse(payload);
  return parsed.success ? parsed.data.code : undefined;
}

function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown, url: string): T {
  const envelope = fyersEnvelopeSchema.safeParse(payload);
  if (envelope.success && envelope.data.s === 'error') {
    throw new FyersApiError(envelope.data.message ?? 'Fyers returned s:error', {
      code: envelope.data.code,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new FyersApiError(`Unexpected response shape from ${url} — ${detail}`);
  }
  return parsed.data;
}
