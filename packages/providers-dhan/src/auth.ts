import {
  DhanHttpClient,
  fetchProfile,
  generateAccessToken,
  isTokenUsable,
  renewToken,
  TOKEN_LIFETIME_MS,
} from '@equitywise/dhan';
import { MarketDataProviderError } from '@equitywise/market-data';
import { PROVIDER_ID, toProviderError } from './errors.js';

/**
 * Provider authorisation, behind a neutral surface.
 *
 * The same shape as `@equitywise/providers-fyers`'s, so the worker's credential
 * job treats "which provider" as configuration. Dhan is simpler than Fyers in
 * one way — there is no browser OAuth step at all; a token is minted from the
 * three secrets — and has one wrinkle of its own: a live token can be RENEWED
 * for another 24 h without the secrets, which is preferred when possible.
 */

export interface AuthorizedCredential {
  readonly accessToken: string;
  readonly expiresAt: Date;
  /**
   * The principal the token belongs to — Dhan's client id.
   *
   * Named `appId` to match the shared `provider_credentials` row and the Fyers
   * surface, so one store serves both providers without a schema change.
   */
  readonly appId: string;
}

/** Env var the running process reads a hand-supplied credential from. */
export const CREDENTIAL_ENV_VAR = 'DHAN_ACCESS_TOKEN';

/**
 * Credentials that can MINT a token, as opposed to one that merely holds it.
 *
 * Account-level: the PIN and the TOTP seed. Only the worker is given them.
 */
export interface RefreshConfig {
  readonly clientId: string;
  readonly pin: string;
  readonly totpSecret: string;
}

/**
 * Reads refresh config, or explains precisely what is missing.
 *
 * Returns null when NOTHING is configured — a deployment that deliberately
 * holds no minting secrets is valid, not an error. A PARTIAL configuration
 * throws, because it is always a mistake.
 */
export function readRefreshConfig(env: NodeJS.ProcessEnv): RefreshConfig | null {
  const clientId = env.DHAN_CLIENT_ID ?? '';
  const pin = env.DHAN_PIN ?? '';
  const totpSecret = env.DHAN_TOTP_SECRET ?? '';

  if (clientId === '' && pin === '' && totpSecret === '') return null;

  const missing: string[] = [];
  if (clientId === '') missing.push('DHAN_CLIENT_ID');
  if (pin === '') missing.push('DHAN_PIN');
  if (totpSecret === '') missing.push('DHAN_TOTP_SECRET');

  if (missing.length > 0) {
    throw new MarketDataProviderError(
      `Unattended Dhan login is half-configured: ${missing.join(', ')} missing from .env`,
      {
        failure: 'not_configured',
        providerId: PROVIDER_ID,
        remedy: 'Set all three, or clear them and supply DHAN_ACCESS_TOKEN by hand.',
      },
    );
  }

  return { clientId, pin, totpSecret };
}

/**
 * Where a minted credential is kept so other processes can use it.
 *
 * An interface rather than a database import: this package stays free of any
 * storage dependency, and the refresh path is testable with an in-memory store.
 */
export interface CredentialStore {
  read(): Promise<AuthorizedCredential | null>;
  write(credential: AuthorizedCredential): Promise<void>;
}

export interface RefreshDeps {
  readonly config: RefreshConfig;
  readonly now?: Date;
  /** Injectable transport, so the flow is testable without a network. */
  readonly fetchImpl?: typeof fetch;
}

function httpFor(fetchImpl: typeof fetch | undefined): DhanHttpClient {
  return new DhanHttpClient(fetchImpl === undefined ? {} : { fetchImpl });
}

/** Mints a brand-new credential from client id + PIN + TOTP. */
export async function refreshCredential(deps: RefreshDeps): Promise<AuthorizedCredential> {
  const now = deps.now ?? new Date();
  try {
    const minted = await generateAccessToken(
      { http: httpFor(deps.fetchImpl), now: () => now },
      deps.config,
    );
    return { accessToken: minted.accessToken, expiresAt: minted.expiresAt, appId: minted.clientId };
  } catch (error) {
    throw toProviderError(error);
  }
}

/**
 * How close to expiry a live token is swapped for a fresh one.
 *
 * Dhan tokens last 24 h from the mint, so a token minted at 08:30 dies at
 * 08:30 the next day — mid pre-open. Renewing anything with under this much
 * life left keeps the morning check from being the one that discovers it.
 */
export const RENEW_WITHIN_MS = 6 * 60 * 60 * 1_000;

export interface EnsureCredentialResult {
  readonly credential: AuthorizedCredential;
  /** False when the stored credential was still good and nothing was minted. */
  readonly refreshed: boolean;
  /** How the credential was obtained on this call. */
  readonly via: 'stored' | 'renewed' | 'minted';
}

/**
 * The stored credential if it is still comfortably usable, a renewed one if
 * it is usable but ageing, otherwise a freshly minted one.
 *
 * Renewal needs no secrets and does not count against the 2-minute mint
 * throttle, so it is tried first whenever the stored token is still alive. A
 * renewal failure is not fatal — the mint path follows — but a mint failure
 * is, and is not papered over with the stale token: it would surface later as
 * a confusing authorisation error from an unrelated request.
 *
 * Verified live 2026-09-17: `RenewToken` answers "Renewal of token not allowed
 * for this token type" for a TOTP-minted token, so in practice the renewal is
 * one failed call and the mint is what happens. The attempt is kept because
 * the endpoint is documented and may apply to other token types (a token
 * pasted from the Dhan web app); the worker's nightly rollover is timed so a
 * token is normally already expired when it runs and goes straight to mint.
 */
export async function ensureCredential(deps: {
  readonly config: RefreshConfig;
  readonly store: CredentialStore;
  readonly now?: Date;
  readonly fetchImpl?: typeof fetch;
}): Promise<EnsureCredentialResult> {
  const now = deps.now ?? new Date();
  const existing = await deps.store.read();
  const clientId = deps.config.clientId;

  const usable =
    existing !== null &&
    isTokenUsable(
      {
        accessToken: existing.accessToken,
        expiresAt: existing.expiresAt,
        clientId: existing.appId,
      },
      clientId,
      now,
    );

  if (usable && existing !== null) {
    const remaining = existing.expiresAt.getTime() - now.getTime();
    if (remaining > RENEW_WITHIN_MS)
      return { credential: existing, refreshed: false, via: 'stored' };

    try {
      const renewed = await renewToken(
        { http: httpFor(deps.fetchImpl), now: () => now },
        { clientId, accessToken: existing.accessToken },
      );
      const credential: AuthorizedCredential = {
        accessToken: renewed.accessToken,
        expiresAt: renewed.expiresAt,
        appId: clientId,
      };
      await deps.store.write(credential);
      return { credential, refreshed: true, via: 'renewed' };
    } catch {
      // Fall through to a full mint. The stored token is still alive, so the
      // worst case is one wasted call.
    }
  }

  const credential = await refreshCredential({
    config: deps.config,
    now,
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
  });
  await deps.store.write(credential);
  return { credential, refreshed: true, via: 'minted' };
}

/** Sanity: the documented lifetime, for schedules that want to reason about it. */
export const TOKEN_LIFETIME = TOKEN_LIFETIME_MS;

export interface SubscriptionStatus {
  readonly dataApiActive: boolean;
  readonly dataValidUntil: string | null;
  readonly tokenValidUntil: string | null;
}

/**
 * Whether the Data API subscription is live — the one Dhan-specific fact an
 * operator page needs. Read-only, cheap, and the clearest early warning that
 * the monthly debit failed.
 */
export async function checkSubscription(
  credential: { readonly appId: string; readonly accessToken: string },
  fetchImpl?: typeof fetch,
): Promise<SubscriptionStatus> {
  try {
    const profile = await fetchProfile(
      { http: httpFor(fetchImpl) },
      { clientId: credential.appId, accessToken: credential.accessToken },
    );
    return {
      dataApiActive: profile.dataApiActive,
      dataValidUntil: profile.dataValidUntil,
      tokenValidUntil: profile.tokenValidUntil,
    };
  } catch (error) {
    throw toProviderError(error);
  }
}
