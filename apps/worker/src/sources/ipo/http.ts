import { DEFAULT_COOLDOWN_MS, PathCircuitBreaker, parseRetryAfter } from '@equitywise/shared';
import { ALLOW_ALL, isAllowed, parseRobots, type RobotsRules } from './robots.js';

/**
 * The polite HTTP client every IPO source goes through
 * (docs/planning/ipos-plan.md §5.3). One instance per source per run.
 *
 *   - robots.txt is ENFORCED: a disallowed path throws before any request. A
 *     robots.txt that answers 5xx/429 or cannot be reached means "disallow
 *     everything" for the run (RFC 9309 §2.3.1.4); a 4xx means no rules.
 *   - Redirects are followed HERE, not by the transport, so every hop is
 *     robots-checked, budgeted, https-only and kept on the starting site.
 *   - Requests are serialised and spaced at least `minIntervalMs` apart.
 *   - A per-run budget caps every request, retries and robots fetches included.
 *   - Only network errors, 429 and 5xx are retried, with full-jitter backoff
 *     and `Retry-After` honoured; a long ban opens the circuit for the host
 *     and fails fast instead of waiting inside the job.
 *   - Cookies a site sets are kept for the run (NSE needs its session cookie).
 *   - The transport is pluggable: BSE's servers need a lenient HTTP parser
 *     (Phase 10), everything else uses `fetch`.
 */

export interface TransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

export interface TransportResponse {
  readonly status: number;
  readonly url: string;
  /** Header name (lowercase) → value; `set-cookie` may repeat. */
  readonly headers: ReadonlyMap<string, readonly string[]>;
  readonly body: Uint8Array;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

/** Hard cap on any response body: no IPO page is this large; an RHP is fetched separately. */
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export const fetchTransport =
  (maxBytes = DEFAULT_MAX_BYTES): Transport =>
  async ({ url, headers, signal }) => {
    // The client follows redirects itself, hop by hop, with its own checks.
    const response = await fetch(url, { headers, signal, redirect: 'manual' });
    const map = new Map<string, string[]>();
    response.headers.forEach((value, name) => {
      if (name !== 'set-cookie') map.set(name, [value]);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) map.set('set-cookie', cookies);
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > maxBytes) {
      await response.body?.cancel();
      throw new Error(`${url}: response of ${declared} bytes exceeds the ${maxBytes}-byte cap`);
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > maxBytes)
      throw new Error(
        `${url}: response of ${body.byteLength} bytes exceeds the ${maxBytes}-byte cap`,
      );
    return { status: response.status, url: response.url || url, headers: map, body };
  };

export class SourceHttpError extends Error {
  override readonly name = 'SourceHttpError';
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`${url} responded ${status}`);
  }
}

export class RobotsDisallowedError extends Error {
  override readonly name = 'RobotsDisallowedError';
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

export class RobotsUnavailableError extends Error {
  override readonly name = 'RobotsUnavailableError';
  constructor(readonly host: string) {
    super(`robots.txt for ${host} could not be read (5xx, 429 or unreachable); not fetching`);
  }
}

export class RedirectRefusedError extends Error {
  override readonly name = 'RedirectRefusedError';
  constructor(
    readonly from: string,
    readonly to: string,
    readonly reason: string,
  ) {
    super(`${from} redirected to ${to}: ${reason}`);
  }
}

export class BudgetExceededError extends Error {
  override readonly name = 'BudgetExceededError';
  constructor(readonly limit: number) {
    super(`request budget of ${limit} for this run is spent`);
  }
}

export class CircuitOpenError extends Error {
  override readonly name = 'CircuitOpenError';
  constructor(
    readonly host: string,
    readonly retryAfterMs: number,
  ) {
    super(`${host} is cooling down for ${Math.ceil(retryAfterMs / 1000)}s after a ban`);
  }
}

export interface PoliteClientOptions {
  readonly sourceId: string;
  readonly userAgent: string;
  /** The product token robots.txt groups are matched against. */
  readonly robotsAgent: string;
  readonly minIntervalMs: number;
  readonly maxRequestsPerRun: number;
  readonly timeoutMs?: number;
  /** Total attempts per request, first try included. */
  readonly maxAttempts?: number;
  /** A `Retry-After` longer than this opens the circuit instead of waiting. */
  readonly maxRetryWaitMs?: number;
  readonly respectRobots?: boolean;
  readonly transport?: Transport;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  /** Aborts in-flight and future requests (worker shutdown). */
  readonly signal?: AbortSignal;
}

export interface RequestOptions {
  readonly accept?: string;
  readonly referer?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

const sleepReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Indian second-level labels under `.in` (`sebi.gov.in` is a site; `gov.in` is not). */
const IN_SECOND_LEVEL = new Set([
  'co',
  'gov',
  'org',
  'net',
  'ac',
  'nic',
  'res',
  'gen',
  'firm',
  'ind',
]);

/**
 * The site a host belongs to: its registrable domain. `nsearchives.nseindia.com`
 * → `nseindia.com`, `www.sebi.gov.in` → `sebi.gov.in`. Exported for tests.
 */
export function siteOf(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const take =
    labels.length >= 3 && labels.at(-1) === 'in' && IN_SECOND_LEVEL.has(labels.at(-2) ?? '')
      ? 3
      : 2;
  return labels.slice(-take).join('.');
}

/** Why a redirect from `from` to `to` may not be followed, or null when it may. */
export function redirectRefusal(from: URL, to: URL): string | null {
  if (to.protocol !== 'https:' && !(from.protocol === 'http:' && to.protocol === 'http:'))
    return 'only https redirects are followed';
  if (siteOf(to.hostname) !== siteOf(from.hostname)) return "it leaves the source's site";
  return null;
}

/** The rule set standing for an unreadable robots.txt: nothing is fetched from the host. */
const UNREACHABLE: RobotsRules = { groups: new Map() };

export class PoliteHttpClient {
  private readonly options: Required<
    Omit<PoliteClientOptions, 'signal' | 'transport' | 'now' | 'sleep' | 'random'>
  >;
  private readonly transport: Transport;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly signal: AbortSignal | undefined;
  private readonly breaker: PathCircuitBreaker;
  private readonly robots = new Map<string, RobotsRules>();
  private readonly cookies = new Map<string, string>();
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private queue: Promise<unknown> = Promise.resolve();
  private spent = 0;

  constructor(options: PoliteClientOptions) {
    this.options = {
      sourceId: options.sourceId,
      userAgent: options.userAgent,
      robotsAgent: options.robotsAgent,
      minIntervalMs: options.minIntervalMs,
      maxRequestsPerRun: options.maxRequestsPerRun,
      timeoutMs: options.timeoutMs ?? 20_000,
      maxAttempts: options.maxAttempts ?? 3,
      maxRetryWaitMs: options.maxRetryWaitMs ?? 60_000,
      respectRobots: options.respectRobots ?? true,
    };
    this.transport = options.transport ?? fetchTransport();
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? sleepReal;
    this.random = options.random ?? Math.random;
    this.signal = options.signal;
    this.breaker = new PathCircuitBreaker({ now: this.now });
  }

  /** Requests spent this run, robots and retries included. */
  get requestsSpent(): number {
    return this.spent;
  }

  async getText(url: string, options: RequestOptions = {}): Promise<string> {
    return new TextDecoder().decode((await this.get(url, options)).body);
  }

  async getJson(url: string, options: RequestOptions = {}): Promise<unknown> {
    const text = await this.getText(url, {
      accept: 'application/json, text/plain, */*',
      ...options,
    });
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`${url}: response is not JSON (${text.slice(0, 60).replace(/\s+/g, ' ')}…)`);
    }
  }

  async getBytes(url: string, options: RequestOptions = {}): Promise<Uint8Array> {
    return (await this.get(url, options)).body;
  }

  /** One serialised, robots-checked, paced, retried GET. Non-2xx throws `SourceHttpError`. */
  async get(url: string, options: RequestOptions = {}): Promise<TransportResponse> {
    const run = this.queue.then(() => this.getNow(url, options));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async getNow(url: string, options: RequestOptions): Promise<TransportResponse> {
    const start = new URL(url);
    let current = start;
    for (let hop = 0; ; hop += 1) {
      const response = await this.fetchOnce(current.href, options);
      if (!REDIRECT_STATUSES.has(response.status)) return response;
      if (hop >= MAX_REDIRECTS) throw new Error(`${url}: more than ${MAX_REDIRECTS} redirects`);
      const location = response.headers.get('location')?.[0];
      if (location === undefined) throw new SourceHttpError(response.status, current.href);
      const next = new URL(location, current);
      const refusal = redirectRefusal(start, next);
      if (refusal !== null) throw new RedirectRefusedError(url, next.href, refusal);
      current = next;
    }
  }

  /** One robots-checked, retried request. Returns a 2xx or a redirect; anything else throws. */
  private async fetchOnce(url: string, options: RequestOptions): Promise<TransportResponse> {
    const target = new URL(url);
    if (this.options.respectRobots) {
      const rules = await this.robotsFor(target);
      if (rules === UNREACHABLE) throw new RobotsUnavailableError(target.host);
      if (!isAllowed(rules, this.options.robotsAgent, `${target.pathname}${target.search}`))
        throw new RobotsDisallowedError(url);
    }

    for (let attempt = 1; ; attempt += 1) {
      const host = target.host;
      const cooling = this.breaker.retryAfterMs(host);
      if (cooling > 0) throw new CircuitOpenError(host, cooling);

      let response: TransportResponse | null = null;
      let failure: unknown = null;
      try {
        response = await this.send(url, options);
      } catch (error) {
        if (error instanceof BudgetExceededError || this.signal?.aborted) throw error;
        failure = error;
      }

      if (response !== null && response.status >= 200 && response.status < 300) return response;
      if (response !== null && REDIRECT_STATUSES.has(response.status)) return response;
      const retryable =
        response === null ||
        response.status === 429 ||
        (response.status >= 500 && response.status <= 599);
      if (!retryable || attempt >= this.options.maxAttempts) {
        if (response === null) throw failure;
        if (response.status === 429)
          this.breaker.trip(host, this.retryAfter(response) ?? DEFAULT_COOLDOWN_MS);
        throw new SourceHttpError(response.status, url);
      }

      const stated = response === null ? undefined : this.retryAfter(response);
      if (stated !== undefined && stated > this.options.maxRetryWaitMs) {
        this.breaker.trip(host, stated);
        throw new CircuitOpenError(host, stated);
      }
      // Full jitter: a random wait up to 2s × 2^(attempt−1), capped at 30s.
      const backoff = this.random() * Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      await this.sleep(Math.max(stated ?? 0, backoff));
    }
  }

  private retryAfter(response: TransportResponse): number | undefined {
    return parseRetryAfter(response.headers.get('retry-after')?.[0], this.now());
  }

  private async send(url: string, options: RequestOptions): Promise<TransportResponse> {
    if (this.spent >= this.options.maxRequestsPerRun)
      throw new BudgetExceededError(this.options.maxRequestsPerRun);
    const wait = this.lastRequestAt + this.options.minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.spent += 1;
    this.lastRequestAt = this.now();

    const headers: Record<string, string> = {
      'User-Agent': this.options.userAgent,
      Accept: options.accept ?? 'text/html,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(options.referer === undefined ? {} : { Referer: options.referer }),
      ...options.headers,
    };
    if (this.cookies.size > 0)
      headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');

    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const signal = this.signal === undefined ? timeout : AbortSignal.any([timeout, this.signal]);
    const response = await this.transport({ url, headers, signal });
    for (const cookie of response.headers.get('set-cookie') ?? []) {
      const pair = cookie.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return response;
  }

  /**
   * The host's robots rules, fetched once per run (RFC 9309): a 2xx is parsed
   * (an HTML app shell is "no file", so no rules); a 4xx is no rules; a 5xx,
   * a 429 or no answer at all is UNREACHABLE — nothing is fetched from that
   * host this run. Redirects are followed up to five hops on the same site.
   */
  private async robotsFor(target: URL): Promise<RobotsRules> {
    const cached = this.robots.get(target.host);
    if (cached !== undefined) return cached;
    let rules: RobotsRules = UNREACHABLE;
    let url = new URL(`${target.protocol}//${target.host}/robots.txt`);
    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        const response = await this.send(url.href, { accept: 'text/plain,*/*;q=0.5' });
        const location = response.headers.get('location')?.[0];
        if (REDIRECT_STATUSES.has(response.status) && location !== undefined) {
          const next = new URL(location, url);
          // A robots redirect off the site counts as "no file" (RFC 9309 §2.3.1.2).
          if (redirectRefusal(url, next) !== null) {
            rules = ALLOW_ALL;
            break;
          }
          url = next;
          continue;
        }
        const type = response.headers.get('content-type')?.[0] ?? '';
        if (response.status >= 200 && response.status < 300)
          rules = /html/i.test(type)
            ? ALLOW_ALL
            : parseRobots(new TextDecoder().decode(response.body));
        else if (response.status >= 400 && response.status < 500 && response.status !== 429)
          rules = ALLOW_ALL;
        break;
      }
    } catch (error) {
      if (error instanceof BudgetExceededError) throw error;
      // Unreachable: stays UNREACHABLE.
    }
    this.robots.set(target.host, rules);
    return rules;
  }
}
