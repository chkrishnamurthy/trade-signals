/**
 * The Fyers adapter.
 *
 * Only the composition root (`apps/web/src/server/provider.ts`, the worker's
 * bootstrap) imports this. Business logic depends on `@wealthos/market-data`.
 */
export type { FyersProviderOptions } from './adapter.js';
export { createFyersProvider } from './adapter.js';
export type {
  AuthConfig,
  AuthorizedCredential,
  CredentialStore,
  EnsureCredentialResult,
  RefreshConfig,
  RefreshDeps,
} from './auth.js';
export {
  authorizationUrl,
  CREDENTIAL_ENV_VAR,
  completeAuthorization,
  ensureCredential,
  persistCredential,
  readAuthConfig,
  readRefreshConfig,
  refreshCredential,
} from './auth.js';
export { FyersNotConfiguredError, PROVIDER_ID, toProviderError } from './errors.js';
export { SUPPORTED_RESOLUTIONS, toFyersResolution } from './resolution.js';
