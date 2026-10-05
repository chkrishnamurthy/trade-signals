import { getProviderCredential, logEvent, saveProviderCredential } from '@equitywise/db';
import type { WorkerContext } from '../context.js';
import type {
  CredentialStrategy,
  WorkerCredential,
  WorkerCredentialStore,
} from '../credentials.js';
import { redactMessage } from '../job-failures.js';
import { errorFields, type Logger } from '../log.js';

/**
 * Credential refresh, for every provider the worker holds.
 *
 * Market-data tokens expire every day. This job is the only place a new one
 * is obtained unattended, and it runs the same way for each provider: read the
 * stored credential, keep it if it is still good, otherwise mint (or, where
 * the provider allows, renew) and store the result.
 *
 * The worker is deliberately the ONLY process holding the secrets that can
 * mint. It writes the result to the database, where `apps/web` reads it — so
 * a deployed web host carries a credential that dies within the day and can
 * only read market data, while the login ID, TOTP seed and PIN never leave this
 * host. See `schema/credentials.ts`.
 *
 * A failure here is loud and does NOT fall back to the stale token: every
 * subsequent request would fail upstream with an authorisation error that
 * gives no hint the real cause was a refresh that quietly did not happen.
 */

/**
 * True when this process must not log in to a provider.
 *
 * Fyers allows one session per account, and a login anywhere invalidates the
 * live token — so a developer running the worker against the production
 * database (over the SSH tunnel) would take market data down for everyone.
 * `pnpm dev` sets `WORKER_MINT_CREDENTIALS=false`; production starts with
 * `pnpm start` and is unaffected. Set it to `true` to mint on purpose.
 * A worker that cannot mint still adopts whatever token is stored.
 */
export function mintingDisabled(env: NodeJS.ProcessEnv): boolean {
  return env.WORKER_MINT_CREDENTIALS?.trim().toLowerCase() === 'false';
}

/** Backs a strategy's `ensure` with the shared table, one row per provider. */
export function databaseCredentialStore(
  context: WorkerContext,
  providerId: string,
): WorkerCredentialStore {
  return {
    async read(): Promise<WorkerCredential | null> {
      const stored = await getProviderCredential(context.db, providerId);
      if (stored === null) return null;
      return {
        accessToken: stored.accessToken,
        expiresAt: stored.expiresAt,
        appId: stored.appId,
      };
    },
    async write(credential: WorkerCredential): Promise<void> {
      await saveProviderCredential(context.db, {
        providerId,
        appId: credential.appId,
        accessToken: credential.accessToken,
        expiresAt: credential.expiresAt,
      });
    },
  };
}

export interface RefreshResult {
  readonly providerId: string;
  /** False when the stored credential was still valid and nothing was minted. */
  readonly refreshed: boolean;
  /** True when no minting secrets are configured; the provider is then a no-op. */
  readonly skipped: boolean;
  /** How the credential in use was obtained. Absent when nothing usable exists. */
  readonly via?: 'stored' | 'renewed' | 'minted';
}

export interface RefreshOptions {
  readonly now?: Date;
  /** Environment to read the minting switch and secrets from. Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Refresh one provider only — the self-heal path, after ITS token was rejected. */
  readonly providerId?: string;
  /**
   * Only providers whose strategy asks for the nightly rollover — those whose
   * token lasts a fixed span from its mint rather than to a fixed hour, so the
   * morning job alone would leave it expiring mid pre-open the next day.
   */
  readonly rolloverOnly?: boolean;
}

/**
 * Ensures the process is holding a usable credential for each provider it was
 * built with, minting or renewing where needed.
 *
 * Safe to call at startup and on a schedule: a still-valid stored token is
 * reused rather than replaced, so an extra call costs one indexed read per
 * provider. Every provider is attempted even if an earlier one failed — a Dhan
 * outage must not leave Fyers without its morning token — and the first
 * failure is rethrown afterwards so the scheduler records the run as failed.
 */
export async function refreshProviderCredential(
  context: WorkerContext,
  log: Logger,
  options: RefreshOptions = {},
): Promise<RefreshResult[]> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const results: RefreshResult[] = [];
  let firstFailure: unknown = null;

  for (const strategy of context.credentialStrategies) {
    if (options.providerId !== undefined && strategy.providerId !== options.providerId) continue;
    if (options.rolloverOnly === true && !strategy.nightlyRollover) continue;
    try {
      results.push(
        await refreshOne(
          context,
          strategy,
          log.child(strategy.providerId),
          now,
          env,
          options.providerId !== undefined,
        ),
      );
    } catch (error) {
      firstFailure ??= error;
    }
  }

  if (firstFailure !== null) throw firstFailure;
  return results;
}

async function refreshOne(
  context: WorkerContext,
  strategy: CredentialStrategy,
  log: Logger,
  now: Date,
  env: NodeJS.ProcessEnv,
  /** True on the self-heal path: the provider just rejected the token we held. */
  selfHeal: boolean,
): Promise<RefreshResult> {
  const { providerId } = strategy;
  const store = databaseCredentialStore(context, providerId);
  const minter = mintingDisabled(env) ? null : strategy.minter(env);

  if (minter === null) {
    // A worker with no minting secrets is a valid configuration — the operator
    // supplies tokens by hand. It must still adopt what that login stored: a
    // worker that only ever trusted its own start-up environment would keep
    // sending the expired token it booted with until it was restarted, with
    // every history call failing and the market looking quiet.
    const stored = await store.read();
    if (stored !== null && stored.expiresAt.getTime() > now.getTime()) {
      context.setAccessToken(providerId, stored.accessToken);
      log.info('using the stored credential; unattended login is not configured', {
        expiresAt: stored.expiresAt.toISOString(),
      });
      return { providerId, refreshed: false, skipped: true, via: 'stored' };
    }

    log.warn('no usable credential and unattended login is not configured', {
      stored: stored === null ? 'none' : `expired at ${stored.expiresAt.toISOString()}`,
      remedy: strategy.manualRemedy,
    });
    return { providerId, refreshed: false, skipped: true };
  }

  if (selfHeal) {
    await recordCredentialEvent(context, log, providerId, 'credential_invalidated', {
      note: 'the provider rejected the token in use; refreshing',
    });
  }

  try {
    const { credential, refreshed, via } = await minter.ensure(store, now);

    // Even when nothing was minted, the process may have booted with an empty
    // or stale token in its environment, so the stored one is always applied.
    context.setAccessToken(providerId, credential.accessToken);

    // No token, no fragment of one, and no secret is ever logged.
    log.info(refreshed ? `credential ${via}` : 'stored credential still valid', {
      refreshed,
      via,
      expiresAt: credential.expiresAt.toISOString(),
    });
    if (refreshed) {
      await recordCredentialEvent(
        context,
        log,
        providerId,
        via === 'renewed' ? 'credential_refreshed' : 'credential_minted',
        { via, expiresAt: credential.expiresAt.toISOString() },
      );
    }
    return { providerId, refreshed, skipped: false, via };
  } catch (error) {
    log.error('credential refresh failed; a manual login is required', {
      remedy: strategy.mintRemedy,
      ...errorFields(error),
    });
    await recordCredentialEvent(context, log, providerId, 'credential_refresh_failed', {
      error: redactMessage(error instanceof Error ? error.message : String(error)),
    });
    throw error;
  }
}

/**
 * Stores a credential lifecycle event (docs/planning/logging-plan.md, phase 3).
 * Never carries a token, a fragment of one, or a secret — only the provider, the
 * event and non-sensitive facts such as the expiry. Best-effort by design.
 */
async function recordCredentialEvent(
  context: WorkerContext,
  log: Logger,
  providerId: string,
  event:
    | 'credential_minted'
    | 'credential_refreshed'
    | 'credential_invalidated'
    | 'credential_refresh_failed',
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await logEvent(context.db, {
      category: 'provider',
      event,
      actorType: 'worker',
      detail: { provider: providerId, ...detail },
    });
  } catch (error) {
    log.warn('could not store a credential event', { event, ...errorFields(error) });
  }
}
