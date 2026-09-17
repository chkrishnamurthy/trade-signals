import {
  PROVIDER_ID as DHAN,
  CREDENTIAL_ENV_VAR as DHAN_TOKEN_ENV_VAR,
  ensureCredential as ensureDhanCredential,
  readRefreshConfig as readDhanRefreshConfig,
} from '@equitywise/providers-dhan';
import {
  ensureCredential as ensureFyersCredential,
  PROVIDER_ID as FYERS,
  CREDENTIAL_ENV_VAR as FYERS_TOKEN_ENV_VAR,
  readRefreshConfig as readFyersRefreshConfig,
} from '@equitywise/providers-fyers';

/**
 * Credential strategies — one per provider the worker can hold a token for.
 *
 * The refresh job is provider-neutral: it asks a strategy whether unattended
 * minting is configured, hands it the shared store, and applies whatever comes
 * back. Everything provider-shaped — which env vars, which login dance, whether
 * a live token can be renewed without the secrets — stays in this file, which
 * sits beside the composition root as the only other place in the worker that
 * names a provider package.
 *
 * Both providers store the same three fields under their own `providerId` row
 * in `provider_credentials`; `appId` holds the Fyers app id or the Dhan client
 * id, whichever principal the token was minted for.
 */

export interface WorkerCredential {
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly appId: string;
}

export interface WorkerCredentialStore {
  read(): Promise<WorkerCredential | null>;
  write(credential: WorkerCredential): Promise<void>;
}

export interface EnsureResult {
  readonly credential: WorkerCredential;
  /** False when the stored credential was still good and nothing was minted. */
  readonly refreshed: boolean;
  /** How the credential was obtained on this call. */
  readonly via: 'stored' | 'renewed' | 'minted';
}

/** A strategy with its minting secrets resolved from the environment. */
export interface CredentialMinter {
  ensure(store: WorkerCredentialStore, now: Date): Promise<EnsureResult>;
}

export interface CredentialStrategy {
  readonly providerId: string;
  /**
   * Resolves the minting secrets, or null when none are configured — a valid
   * deployment where the operator supplies tokens by hand. Throws when the
   * configuration is partial, because that is always a mistake.
   */
  minter(env: NodeJS.ProcessEnv): CredentialMinter | null;
  /** The env var an operator can paste a token into instead. */
  readonly tokenEnvVar: string;
  /** What to do when nothing can mint and nothing usable is stored. */
  readonly manualRemedy: string;
  /** What to check when an unattended mint fails. */
  readonly mintRemedy: string;
  /**
   * Whether the token needs the nightly rollover as well as the morning check.
   *
   * True when a token lasts a fixed span from its mint (24 h for Dhan): minted
   * at 07:05, it would die at 07:04 the next morning, so it is rolled over at
   * 01:35 instead — renewed without the secrets when it still has life, minted
   * otherwise. False when a token is dated to a fixed hour regardless of when
   * it was minted (Fyers, 07:00 IST): the morning job is the right moment and
   * a night-time mint would only shorten its life.
   */
  readonly nightlyRollover: boolean;
}

/**
 * Fyers: daily TOTP login through the undocumented vagator flow; no renewal.
 *
 * Single-session: any other login with the same account kills the token early,
 * which is what the self-heal in the signal jobs recovers from.
 */
export const fyersCredentialStrategy: CredentialStrategy = {
  providerId: FYERS,
  tokenEnvVar: FYERS_TOKEN_ENV_VAR,
  nightlyRollover: false,
  manualRemedy:
    'Run `pnpm fyers:login`, or set FYERS_ID, FYERS_TOTP_SECRET and FYERS_PIN to refresh automatically.',
  mintRemedy: 'Run `pnpm fyers:login` and check FYERS_ID / FYERS_TOTP_SECRET / FYERS_PIN.',
  minter(env) {
    const config = readFyersRefreshConfig(env);
    if (config === null) return null;
    return {
      async ensure(store, now) {
        const { credential, refreshed } = await ensureFyersCredential({ config, store, now });
        return { credential, refreshed, via: refreshed ? 'minted' : 'stored' };
      },
    };
  },
};

/**
 * Dhan: documented TOTP mint (once per two minutes at most), and a live token
 * can be renewed for another day without the secrets. Not single-session.
 *
 * The 24 h-from-mint lifetime is why this strategy asks for the nightly
 * rollover: a token minted at 07:05 would otherwise die at 07:04 the next
 * morning, and the morning check would be the one to discover it.
 */
export const dhanCredentialStrategy: CredentialStrategy = {
  providerId: DHAN,
  tokenEnvVar: DHAN_TOKEN_ENV_VAR,
  nightlyRollover: true,
  manualRemedy:
    'Set DHAN_CLIENT_ID, DHAN_PIN and DHAN_TOTP_SECRET to refresh automatically, or paste a token from web.dhan.co into DHAN_ACCESS_TOKEN.',
  mintRemedy:
    'Check DHAN_CLIENT_ID / DHAN_PIN / DHAN_TOTP_SECRET, and that the Data API subscription is active on web.dhan.co.',
  minter(env) {
    const config = readDhanRefreshConfig(env);
    if (config === null) return null;
    return {
      ensure: (store, now) => ensureDhanCredential({ config, store, now }),
    };
  },
};

/** Every strategy the worker knows, keyed by provider id. */
export const CREDENTIAL_STRATEGIES: ReadonlyMap<string, CredentialStrategy> = new Map(
  [fyersCredentialStrategy, dhanCredentialStrategy].map((strategy) => [
    strategy.providerId,
    strategy,
  ]),
);
