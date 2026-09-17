import { getProviderCredential, saveProviderCredential } from '@equitywise/db';
import type { WorkerContext } from '../context.js';
import type {
  CredentialStrategy,
  WorkerCredential,
  WorkerCredentialStore,
} from '../credentials.js';
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
  const results: RefreshResult[] = [];
  let firstFailure: unknown = null;

  for (const strategy of context.credentialStrategies) {
    if (options.providerId !== undefined && strategy.providerId !== options.providerId) continue;
    if (options.rolloverOnly === true && !strategy.nightlyRollover) continue;
    try {
      results.push(await refreshOne(context, strategy, log.child(strategy.providerId), now));
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
): Promise<RefreshResult> {
  const { providerId } = strategy;
  const store = databaseCredentialStore(context, providerId);
  const minter = strategy.minter(process.env);

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
    return { providerId, refreshed, skipped: false, via };
  } catch (error) {
    log.error('credential refresh failed; a manual login is required', {
      remedy: strategy.mintRemedy,
      ...errorFields(error),
    });
    throw error;
  }
}
