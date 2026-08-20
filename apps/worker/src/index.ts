import { createDatabase, getServerInfo, withRetry } from '@signal/db';
import { toIstIsoString } from '@signal/shared';
import { config as loadEnv } from 'dotenv';

// Repo-root .env; this process starts from apps/worker.
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

/**
 * Worker entrypoint.
 *
 * Right now it does exactly one thing: prove the process can reach Neon and
 * report what answered, then exit. The scheduler (croner) and the ingest/signal
 * jobs hang off this same connect-with-backoff preamble later.
 */
async function main(): Promise<void> {
  const startedAt = new Date();
  console.log(`[worker] starting at ${toIstIsoString(startedAt)}`);

  const handle = createDatabase();

  try {
    const info = await withRetry(() => getServerInfo(handle.db), {
      onRetry: (attempt, delayMs, error) => {
        // Neon scales to zero; the first query after an idle period can fail
        // while the compute wakes. That is expected, not an error.
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[worker] connect attempt ${attempt} failed (${reason}); retrying in ${delayMs}ms`,
        );
      },
    });

    console.log(`[worker] connected to ${info.database} as ${info.user}`);
    console.log(`[worker] postgres ${info.serverVersion}`);
    console.log(`[worker] ${info.version}`);
  } finally {
    await handle.close();
  }

  const elapsedMs = Date.now() - startedAt.getTime();
  console.log(`[worker] done in ${elapsedMs}ms`);
}

main().catch((error: unknown) => {
  console.error('[worker] fatal:', error);
  process.exitCode = 1;
});
