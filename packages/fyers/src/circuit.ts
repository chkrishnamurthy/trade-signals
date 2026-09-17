/**
 * The per-path circuit breaker now lives in `@equitywise/shared` so a second
 * provider can share it. Re-exported here so nothing in this package or its
 * consumers changes.
 */
export {
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  PathCircuitBreaker,
  parseRetryAfter,
} from '@equitywise/shared';
