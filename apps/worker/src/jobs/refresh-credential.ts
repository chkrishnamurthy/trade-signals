import { getProviderCredential, saveProviderCredential } from '@equitywise/db';
import {
  type AuthorizedCredential,
  type CredentialStore,
  ensureCredential,
  PROVIDER_ID,
  readRefreshConfig,
} from '@equitywise/providers-fyers';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';

/**
 * Daily credential refresh.
 *
 * Market-data tokens expire every day, and since the refresh-token flow was
 * withdrawn on 1 April 2026 each new one starts from a 2FA login. This job is
 * the only place that happens unattended.
 *
 * The worker is deliberately the ONLY process holding the secrets that can mint
 * a token. It writes the result to the database, where `apps/web` reads it —
 * so a serverless deploy carries a credential that dies within the day and can
 * only read market data, while the login ID, TOTP seed and PIN never leave this
 * host. See `schema/credentials.ts`.
 *
 * A failure here is loud and does NOT fall back to the stale token: every
 * subsequent request would fail upstream with an authorisation error that gives
 * no hint the real cause was a refresh that quietly did not happen.
 */

/** Backs `ensureCredential` with the shared table. */
export function databaseCredentialStore(context: WorkerContext): CredentialStore {
  return {
    async read(): Promise<AuthorizedCredential | null> {
      const stored = await getProviderCredential(context.db, PROVIDER_ID);
      if (stored === null) return null;
      return {
        accessToken: stored.accessToken,
        expiresAt: stored.expiresAt,
        appId: stored.appId,
      };
    },
    async write(credential: AuthorizedCredential): Promise<void> {
      await saveProviderCredential(context.db, {
        providerId: PROVIDER_ID,
        appId: credential.appId,
        accessToken: credential.accessToken,
        expiresAt: credential.expiresAt,
      });
    },
  };
}

export interface RefreshResult {
  /** False when the stored credential was still valid and nothing was minted. */
  readonly refreshed: boolean;
  /** True when no minting secrets are configured; the job is then a no-op. */
  readonly skipped: boolean;
}

/**
 * Ensures the process is holding a usable credential, minting one if not.
 *
 * Safe to call at startup and on a schedule: a still-valid stored token is
 * reused rather than replaced, so an extra call costs one indexed read.
 */
export async function refreshProviderCredential(
  context: WorkerContext,
  log: Logger,
  now = new Date(),
): Promise<RefreshResult> {
  const config = readRefreshConfig(process.env);
  if (config === null) {
    // A worker with no minting secrets is a valid configuration — the operator
    // logs in by hand. It must still adopt what that login stored: `pnpm
    // fyers:login` writes the credential table, and a worker that only ever
    // trusted its own start-up environment would keep sending the expired
    // token it booted with until it was restarted, with every history call
    // failing and the intraday page looking like a quiet market.
    const stored = await databaseCredentialStore(context).read();
    if (stored !== null && stored.expiresAt.getTime() > now.getTime()) {
      context.setAccessToken(stored.accessToken);
      log.info('using the stored credential; unattended login is not configured', {
        expiresAt: stored.expiresAt.toISOString(),
      });
      return { refreshed: false, skipped: true };
    }

    log.warn('no usable credential and unattended login is not configured', {
      stored: stored === null ? 'none' : `expired at ${stored.expiresAt.toISOString()}`,
      remedy:
        'Run `pnpm fyers:login`, or set FYERS_ID, FYERS_TOTP_SECRET and FYERS_PIN to refresh automatically.',
    });
    return { refreshed: false, skipped: true };
  }

  try {
    const { credential, refreshed } = await ensureCredential({
      config,
      store: databaseCredentialStore(context),
      now,
    });

    // Even when nothing was minted, the process may have booted with an empty
    // or stale FYERS_ACCESS_TOKEN, so the stored one is always applied.
    context.setAccessToken(credential.accessToken);

    // No token, no fragment of one, and no secret is ever logged.
    log.info(refreshed ? 'credential refreshed' : 'stored credential still valid', {
      refreshed,
      expiresAt: credential.expiresAt.toISOString(),
    });
    return { refreshed, skipped: false };
  } catch (error) {
    log.error('credential refresh failed; a manual login is required', {
      remedy: 'Run `pnpm fyers:login` and check FYERS_ID / FYERS_TOTP_SECRET / FYERS_PIN.',
      ...errorFields(error),
    });
    throw error;
  }
}
