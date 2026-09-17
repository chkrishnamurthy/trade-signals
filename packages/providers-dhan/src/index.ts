/**
 * The Dhan adapter.
 *
 * Only the composition roots (`apps/web/src/server/provider.ts`, the worker's
 * bootstrap) import this. Business logic depends on `@equitywise/market-data`.
 */
export type { DhanProviderOptions } from './adapter.js';
export { createDhanProvider, dropFormingBar, QUOTE_BATCH_SIZE } from './adapter.js';
export type {
  AuthorizedCredential,
  CredentialStore,
  EnsureCredentialResult,
  RefreshConfig,
  RefreshDeps,
  SubscriptionStatus,
} from './auth.js';
export {
  CREDENTIAL_ENV_VAR,
  checkSubscription,
  ensureCredential,
  RENEW_WITHIN_MS,
  readRefreshConfig,
  refreshCredential,
  TOKEN_LIFETIME,
} from './auth.js';
export { DhanNotConfiguredError, PROVIDER_ID, toProviderError } from './errors.js';
export {
  aggregateMinutes,
  aggregateWeekly,
  dailyBarTimestamp,
  inferMarketStatus,
  toBar,
  toInstrument,
  toQuote,
} from './mapping.js';
export type { ResolutionPlan } from './resolution.js';
export { planResolution, SUPPORTED_RESOLUTIONS } from './resolution.js';
