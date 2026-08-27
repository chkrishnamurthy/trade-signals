import {
  autoLogin,
  buildAuthCodeUrl,
  defaultExpiry,
  exchangeAuthCode,
  FyersHttpClient,
  isTokenUsable,
  writeCachedToken,
} from '@equitywise/fyers';
import { MarketDataProviderError } from '@equitywise/market-data';
import { PROVIDER_ID, toProviderError } from './errors.js';

/**
 * Provider authorisation, behind a neutral surface.
 *
 * The OAuth dance is entirely provider-specific, so it lives here with the rest
 * of the Fyers knowledge. The web app's /login and /callback routes drive it
 * without importing `@equitywise/fyers` — which keeps the boundary test honest and
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

// ---------------------------------------------------------------------------
// Unattended daily refresh
// ---------------------------------------------------------------------------

/**
 * Credentials that can MINT a token, as opposed to one that merely holds it.
 *
 * These are account-level: the TOTP seed is the same 2FA secret that protects
 * the brokerage login, not a data-scoped key. Only the worker is given them.
 * Anything reading market data needs the minted token and nothing else, which
 * is what lets a serverless deploy hold the token without holding these.
 */
export interface RefreshConfig {
  readonly appId: string;
  readonly fyId: string;
  readonly totpSecret: string;
  readonly pin: string;
}

/**
 * Reads refresh config, or explains precisely what is missing.
 *
 * Returns null rather than throwing when NOTHING is configured: a deployment
 * that deliberately holds no minting secrets is a valid configuration, not an
 * error. A PARTIAL configuration does throw, because it is always a mistake.
 */
export function readRefreshConfig(env: NodeJS.ProcessEnv): RefreshConfig | null {
  const appId = env.FYERS_APP_ID ?? '';
  const fyId = env.FYERS_ID ?? '';
  const totpSecret = env.FYERS_TOTP_SECRET ?? '';
  const pin = env.FYERS_PIN ?? '';

  if (fyId === '' && totpSecret === '' && pin === '') return null;

  const missing: string[] = [];
  if (appId === '') missing.push('FYERS_APP_ID');
  if (fyId === '') missing.push('FYERS_ID');
  if (totpSecret === '') missing.push('FYERS_TOTP_SECRET');
  if (pin === '') missing.push('FYERS_PIN');

  if (missing.length > 0) {
    throw new MarketDataProviderError(
      `Unattended login is half-configured: ${missing.join(', ')} missing from .env`,
      {
        failure: 'not_configured',
        providerId: PROVIDER_ID,
        remedy:
          'Set all four, or clear FYERS_ID / FYERS_TOTP_SECRET / FYERS_PIN to log in by hand.',
      },
    );
  }

  return { appId, fyId, totpSecret, pin };
}

/**
 * Where a minted credential is kept so other processes can use it.
 *
 * An interface rather than a database import: this package stays free of any
 * storage dependency, and the same refresh path is testable with an in-memory
 * store.
 */
export interface CredentialStore {
  read(): Promise<AuthorizedCredential | null>;
  write(credential: AuthorizedCredential): Promise<void>;
}

export interface RefreshDeps {
  readonly config: RefreshConfig;
  readonly now?: Date;
  /** Injectable transport, so the login flow is testable without a network. */
  readonly fetchImpl?: typeof fetch;
}

/** Mints a brand-new credential via unattended TOTP login. */
export async function refreshCredential(deps: RefreshDeps): Promise<AuthorizedCredential> {
  const { config } = deps;
  const now = deps.now ?? new Date();
  try {
    const accessToken = await autoLogin({
      http: new FyersHttpClient(),
      // Spread rather than assigned: `exactOptionalPropertyTypes` distinguishes
      // an absent optional property from one explicitly set to undefined.
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
      // `autoLogin` needs only the three login factors; the secret and redirect
      // URI belong to the browser OAuth flow and are deliberately not required
      // here, so the worker can refresh without holding the app secret.
      credentials: {
        appId: config.appId,
        secretKey: '',
        redirectUri: '',
        fyId: config.fyId,
        totpSecret: config.totpSecret,
        pin: config.pin,
      },
    });
    return { accessToken, expiresAt: defaultExpiry(now), appId: config.appId };
  } catch (error) {
    throw toProviderError(error);
  }
}

export interface EnsureCredentialResult {
  readonly credential: AuthorizedCredential;
  /** False when the stored credential was still good and nothing was minted. */
  readonly refreshed: boolean;
}

/**
 * The stored credential if it is still usable, otherwise a freshly minted one.
 *
 * Deliberately does NOT fall back to the manual path on failure. A refresh
 * failure means a human must act, and silently continuing with an expired token
 * would surface later as a confusing authorisation error from an unrelated
 * request.
 */
export async function ensureCredential(deps: {
  readonly config: RefreshConfig;
  readonly store: CredentialStore;
  readonly now?: Date;
  /** Injectable transport, so the login flow is testable without a network. */
  readonly fetchImpl?: typeof fetch;
}): Promise<EnsureCredentialResult> {
  const now = deps.now ?? new Date();
  const existing = await deps.store.read();

  const usable = isTokenUsable(
    existing === null
      ? null
      : {
          accessToken: existing.accessToken,
          expiresAt: existing.expiresAt.toISOString(),
          appId: existing.appId,
        },
    deps.config.appId,
    now,
  );

  if (usable && existing !== null) return { credential: existing, refreshed: false };

  const credential = await refreshCredential({
    config: deps.config,
    now,
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  });
  await deps.store.write(credential);
  return { credential, refreshed: true };
}
