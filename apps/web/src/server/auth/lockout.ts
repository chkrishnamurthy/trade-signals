/**
 * Brute-force / credential-stuffing lockout — a pure state machine, unit-tested.
 *
 * Counts failed attempts in a rolling window (keyed per IP and per email by the
 * caller) and, past a threshold, locks with exponential backoff. Kept pure so the
 * decision logic is testable without a clock or a database; the caller persists
 * the returned state in `auth_attempts` (durable across deploys) and reads the
 * current time.
 */

export interface AttemptState {
  failures: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

export interface LockoutConfig {
  /** Rolling window in which failures accumulate. */
  windowMs: number;
  /** Failures within the window before a lockout begins. */
  maxFailures: number;
  /** First lockout duration; doubles per extra failure. */
  baseLockoutMs: number;
  /** Ceiling on a single lockout. */
  maxLockoutMs: number;
}

export const DEFAULT_LOCKOUT: LockoutConfig = {
  windowMs: 15 * 60_000, // 15 minutes
  maxFailures: 5,
  baseLockoutMs: 60_000, // 1 minute
  maxLockoutMs: 60 * 60_000, // 1 hour
};

/** A fresh state for a key that has never failed. */
export function initialState(now: Date): AttemptState {
  return { failures: 0, windowStart: now, lockedUntil: null };
}

/** True while a lockout is in effect. */
export function isLocked(state: AttemptState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** Milliseconds until the lockout lifts (0 if not locked). */
export function lockRemainingMs(state: AttemptState, now: Date): number {
  if (!isLocked(state, now) || state.lockedUntil === null) return 0;
  return state.lockedUntil.getTime() - now.getTime();
}

/**
 * Record a failed attempt and return the next state. A failure after the window
 * has elapsed starts a fresh window; once failures reach the threshold, each
 * further failure extends the lockout with exponential backoff (capped).
 */
export function registerFailure(
  state: AttemptState,
  now: Date,
  config: LockoutConfig = DEFAULT_LOCKOUT,
): AttemptState {
  const windowExpired = now.getTime() - state.windowStart.getTime() > config.windowMs;
  const failures = windowExpired ? 1 : state.failures + 1;
  const windowStart = windowExpired ? now : state.windowStart;

  if (failures < config.maxFailures) {
    return { failures, windowStart, lockedUntil: null };
  }

  const overage = failures - config.maxFailures; // 0 on the first lockout
  const lockMs = Math.min(config.baseLockoutMs * 2 ** overage, config.maxLockoutMs);
  return { failures, windowStart, lockedUntil: new Date(now.getTime() + lockMs) };
}

/** Clear the counter after a successful login. */
export function registerSuccess(now: Date): AttemptState {
  return initialState(now);
}
