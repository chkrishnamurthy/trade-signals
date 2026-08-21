/**
 * The Fyers adapter.
 *
 * Only the composition root (`apps/web/src/server/provider.ts`, the worker's
 * bootstrap) imports this. Business logic depends on `@signal/market-data`.
 */
export type { FyersProviderOptions } from './adapter.js';
export { createFyersProvider } from './adapter.js';
export type { AuthConfig, AuthorizedCredential } from './auth.js';
export {
  authorizationUrl,
  CREDENTIAL_ENV_VAR,
  completeAuthorization,
  persistCredential,
  readAuthConfig,
} from './auth.js';
export { FyersNotConfiguredError, PROVIDER_ID, toProviderError } from './errors.js';
export { SUPPORTED_RESOLUTIONS, toFyersResolution } from './resolution.js';
