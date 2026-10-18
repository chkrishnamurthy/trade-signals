import { invalidateProviderCredential } from '@equitywise/db';
import { MarketDataProviderError } from '@equitywise/market-data';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';
import { refreshProviderCredential } from './refresh-credential.js';

/** At most one recovery per provider in this window, so an outage cannot storm logins. */
export const SELF_HEAL_INTERVAL_MS = 10 * 60_000;

/**
 * Recovers from an auth failure; `fallbackProviderId` names the provider when the
 * error does not carry one the worker holds. Resolves true when it re-minted.
 */
export type CredentialSelfHeal = (error: unknown, fallbackProviderId?: string) => Promise<boolean>;

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
): CredentialSelfHeal {
  const lastRecovery = new Map<string, number>();
  return async (error, fallbackProviderId = context.providerId) => {
    if (!(error instanceof MarketDataProviderError) || error.failure !== 'auth') return false;
    const providerId = context.providers.has(error.providerId)
      ? error.providerId
      : fallbackProviderId;
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

/**
 * Proves each held provider's credential with one cheap authenticated call, and
 * self-heals the one that is rejected.
 *
 * Needed because no remaining in-session job calls every provider: in `routed`
 * mode quotes go to Dhan, so a Fyers token killed by a manual login (Fyers serves
 * intraday bars, market status and the live socket to the web app) would stay
 * dead until the morning refresh. Market status is the probe — on Fyers it is an
 * authenticated request; on Dhan it is inferred from the clock (no endpoint), so
 * Dhan is covered by the quote job instead. Failures other than `auth` are only
 * logged: a probe never fails the scheduler run.
 */
export async function probeProviderCredentials(
  context: WorkerContext,
  heal: CredentialSelfHeal,
  log: Logger,
): Promise<void> {
  for (const [providerId, provider] of context.providers) {
    try {
      await provider.fetchMarketStatus();
    } catch (error) {
      try {
        if (!(await heal(error, providerId)))
          log.warn('credential probe failed', { providerId, ...errorFields(error) });
      } catch (healError) {
        // One provider's failed re-mint must not stop the next one being probed.
        log.error('credential self-heal failed', { providerId, ...errorFields(healError) });
      }
    }
  }
}
