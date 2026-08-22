/**
 * Per-path circuit breaker for upstream rate-limit bans.
 *
 * Fyers sits behind Cloudflare, which enforces its own edge limits *in addition
 * to* the documented API limits, and does so per path. Observed on 2026-08-22:
 * `/data/quotes` returned `HTTP 429` with a `text/plain` body of
 * `error code: 1015` (Cloudflare's rate-limit code, not a Fyers envelope) and
 * `Retry-After: 1358` — a fixed ~22 minute ban — while `/data/marketStatus` and
 * `/data/history` kept answering 200 throughout.
 *
 * Two consequences drive this class:
 *
 *   - The ban is FIXED-DURATION, so retrying inside it cannot succeed. Every
 *     request sent during the ban is pure waste. `Retry-After` was observed
 *     counting down cleanly (1342 → 1316 → 1290), so requests during the ban do
 *     not extend it — but they buy nothing either.
 *   - The ban is PER PATH, so blocking the whole client would needlessly kill
 *     history and market-status calls that are still being served.
 */

/** Cooldown assumed when a 429 arrives without a usable `Retry-After`. */
export const DEFAULT_COOLDOWN_MS = 60_000;

/** Nothing legitimate asks us to wait longer than this. */
export const MAX_COOLDOWN_MS = 3_600_000;

/**
 * Parses an HTTP `Retry-After` header, which may be either a delay in seconds
 * or an absolute HTTP-date.
 *
 * Returns undefined for anything unparseable, so the caller can fall back to
 * its own default rather than trusting a garbage value.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (header === null || header === undefined) return undefined;
  const trimmed = header.trim();
  if (trimmed === '') return undefined;

  // Delay-seconds form. Guard against a bare "0", which would mean "no wait"
  // and defeat the breaker entirely.
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed) * 1_000;
    return ms <= 0 ? undefined : Math.min(ms, MAX_COOLDOWN_MS);
  }

  // HTTP-date form.
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  const ms = at - now;
  return ms <= 0 ? undefined : Math.min(ms, MAX_COOLDOWN_MS);
}

/**
 * Tracks which upstream paths are banned and until when.
 *
 * Deliberately has no half-open state: the upstream tells us exactly when the
 * ban lifts, so there is nothing to probe for.
 */
export class PathCircuitBreaker {
  private readonly openUntil = new Map<string, number>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  /** Milliseconds until `path` is usable again. 0 when it is usable now. */
  retryAfterMs(path: string): number {
    const until = this.openUntil.get(path);
    if (until === undefined) return 0;
    const remaining = until - this.now();
    if (remaining <= 0) {
      this.openUntil.delete(path);
      return 0;
    }
    return remaining;
  }

  /**
   * Opens the breaker for `path`.
   *
   * Never shortens an existing ban: two concurrent callers can both see the
   * same 429, and the second one's slightly-smaller `Retry-After` must not
   * bring the deadline forward.
   */
  trip(path: string, forMs: number): void {
    const clamped = Math.min(Math.max(forMs, 0), MAX_COOLDOWN_MS);
    const until = this.now() + clamped;
    const existing = this.openUntil.get(path);
    if (existing !== undefined && existing >= until) return;
    this.openUntil.set(path, until);
  }

  /** Forgets any ban on `path`. Exposed for tests and manual recovery. */
  clear(path: string): void {
    this.openUntil.delete(path);
  }

  /** Paths currently banned, with milliseconds remaining. For diagnostics. */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const path of this.openUntil.keys()) {
      const remaining = this.retryAfterMs(path);
      if (remaining > 0) out[path] = remaining;
    }
    return out;
  }
}
