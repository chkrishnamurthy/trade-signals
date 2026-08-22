import {
  buildAuthCodeUrl,
  defaultExpiry,
  exchangeAuthCode,
  FyersHttpClient,
  writeCachedToken,
} from '@wealthos/fyers';
import { MarketDataProviderError } from '@wealthos/market-data';
import { PROVIDER_ID, toProviderError } from './errors.js';

/**
 * Provider authorisation, behind a neutral surface.
 *
 * The OAuth dance is entirely provider-specific, so it lives here with the rest
 * of the Fyers knowledge. The web app's /login and /callback routes drive it
 * without importing `@wealthos/fyers` — which keeps the boundary test honest and
 * means a second provider's auth flow slots in the same way.
 */

export interface AuthConfig {
  readonly appId: string;
  readonly secretKey: string;
  readonly redirectUri: string;
}

/** Reads auth config from the environment, or explains what is missing. */
export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const appId = env.FYERS_APP_ID ?? '';
  const secretKey = env.FYERS_SECRET_KEY ?? '';
  const redirectUri = env.FYERS_REDIRECT_URI ?? '';

  const missing: string[] = [];
  if (appId === '') missing.push('FYERS_APP_ID');
  if (secretKey === '') missing.push('FYERS_SECRET_KEY');
  if (redirectUri === '') missing.push('FYERS_REDIRECT_URI');

  if (missing.length > 0) {
    throw new MarketDataProviderError(
      `Data source is not configured: ${missing.join(', ')} missing from .env`,
      {
        failure: 'not_configured',
        providerId: PROVIDER_ID,
        remedy: 'Add the missing values to .env, then reload.',
      },
    );
  }

  return { appId, secretKey, redirectUri };
}

/**
 * The URL the operator opens to authorise.
 *
 * `state` is returned to the caller so it can be stored and compared on the way
 * back — an unverified `state` makes the callback accept a code the user never
 * asked for.
 */
export function authorizationUrl(config: AuthConfig, state: string): string {
  return buildAuthCodeUrl(config, state);
}

export interface AuthorizedCredential {
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly appId: string;
}

/** Exchanges the one-time code for a credential. */
export async function completeAuthorization(
  config: AuthConfig,
  authCode: string,
  now = new Date(),
): Promise<AuthorizedCredential> {
  try {
    const accessToken = await exchangeAuthCode(new FyersHttpClient(), config, authCode);
    return { accessToken, expiresAt: defaultExpiry(now), appId: config.appId };
  } catch (error) {
    throw toProviderError(error);
  }
}

/** Persists the credential to disk with owner-only permissions. */
export async function persistCredential(
  path: string,
  credential: AuthorizedCredential,
): Promise<void> {
  await writeCachedToken(path, {
    accessToken: credential.accessToken,
    expiresAt: credential.expiresAt.toISOString(),
    appId: credential.appId,
  });
}

/** Env var the running process reads its credential from. */
export const CREDENTIAL_ENV_VAR = 'FYERS_ACCESS_TOKEN';
