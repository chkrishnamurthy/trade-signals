import { createDatabase, type Database, type DatabaseHandle } from '@equitywise/db';
import type { MarketDataProvider } from '@equitywise/market-data';
import { createFyersProvider } from '@equitywise/providers-fyers';

/**
 * Worker composition root.
 *
 * The only place the worker names a concrete provider. Jobs receive a
 * `MarketDataProvider` and a `Database` and know nothing about either's
 * implementation.
 */

export interface WorkerContext {
  readonly db: Database;
  readonly provider: MarketDataProvider;
  readonly providerId: string;
  /**
   * Swaps in a newly minted credential.
   *
   * The provider reads the token per request, so this takes effect on the next
   * call without rebuilding anything. That matters: the rate limiter and
   * circuit breaker live inside the provider and track per-ACCOUNT budgets and
   * edge bans, neither of which is reset by a new credential. Rebuilding on
   * each daily refresh would hand the replacement a budget the account does not
   * have, or walk straight back into a live ban.
   */
  setAccessToken(accessToken: string): void;
  close(): Promise<void>;
}

export function createContext(): WorkerContext {
  const handle: DatabaseHandle = createDatabase({
    // The worker is long-lived and spends minutes at a time on upstream
    // fetches, so idle pooled connections get dropped by Neon underneath it.
    // Logging rather than swallowing: a sudden run of these means something
    // worse than an idle timeout.
    onIdleError: (error) => {
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          job: 'db',
          message: 'idle pool connection failed; it has been discarded',
          errorMessage: error.message,
        })}\n`,
      );
    },
  });

  // Starts as whatever the environment holds — possibly empty, possibly
  // yesterday's — and is replaced by the credential refresh at startup.
  let accessToken = process.env.FYERS_ACCESS_TOKEN ?? '';

  const provider = createFyersProvider({
    appId: process.env.FYERS_APP_ID ?? '',
    accessToken: () => accessToken,
    // The worker is a long-lived process doing bulk history pulls. A wider
    // retry budget than the web app's is right: nobody is waiting on a page.
    attempts: 5,
    timeoutMs: 30_000,
  });

  return {
    db: handle.db,
    provider,
    providerId: provider.id,
    setAccessToken(next: string): void {
      accessToken = next;
    },
    close: () => handle.close(),
  };
}
