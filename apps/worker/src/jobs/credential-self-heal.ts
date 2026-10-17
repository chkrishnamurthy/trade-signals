import { invalidateProviderCredential } from '@equitywise/db';
import { MarketDataProviderError } from '@equitywise/market-data';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { refreshProviderCredential } from './refresh-credential.js';

/** At most one recovery per provider in this window, so an outage cannot storm logins. */
export const SELF_HEAL_INTERVAL_MS = 10 * 60_000;

/**
 * Credential self-heal for in-session jobs.
 *
 * Fyers is single-session: logging in by hand (to place a trade on its own app)
 * invalidates the worker's token before its recorded expiry. When a job's
 * provider call fails with `auth`, this expires the stored credential and mints
 * a fresh one, so the next run — and the web app, which reads the same row —
 * works again without waiting for the morning refresh.
 *
 * Moved here from the intraday and live-feed jobs, which carried it until they
 * were removed (docs/planning/signals-and-paper-removal-plan.md). Same rules:
 * auth failures only, once per provider per {@link SELF_HEAL_INTERVAL_MS}.
 */
export function createCredentialSelfHeal(
  context: WorkerContext,
  log: Logger,
  now: () => number = Date.now,
): (error: unknown) => Promise<boolean> {
  const lastRecovery = new Map<string, number>();
  return async (error) => {
    if (!(error instanceof MarketDataProviderError) || error.failure !== 'auth') return false;
    const providerId = context.providers.has(error.providerId)
      ? error.providerId
      : context.providerId;
    const at = now();
    if (at - (lastRecovery.get(providerId) ?? Number.NEGATIVE_INFINITY) < SELF_HEAL_INTERVAL_MS)
      return false;
    lastRecovery.set(providerId, at);
    log.warn('provider rejected the credential; minting a fresh one', { providerId });
    await invalidateProviderCredential(context.db, providerId);
    await refreshProviderCredential(context, log, { providerId });
    return true;
  };
}
