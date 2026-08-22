import { createDatabase, type Database, type DatabaseHandle } from '@signal/db';
import type { MarketDataProvider } from '@signal/market-data';
import { createFyersProvider } from '@signal/providers-fyers';

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
  const provider = createFyersProvider({
    appId: process.env.FYERS_APP_ID ?? '',
    accessToken: process.env.FYERS_ACCESS_TOKEN ?? '',
    // The worker is a long-lived process doing bulk history pulls. A wider
    // retry budget than the web app's is right: nobody is waiting on a page.
    attempts: 5,
    timeoutMs: 30_000,
  });

  return {
    db: handle.db,
    provider,
    providerId: provider.id,
    close: () => handle.close(),
  };
}
