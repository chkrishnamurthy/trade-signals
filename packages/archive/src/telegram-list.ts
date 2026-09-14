import { listFiles, withClient } from './telegram-client.js';
import { CHANNEL_ID } from './telegram-env.js';

/**
 * List document files in the configured channel, smallest first, so we can pick
 * a small sample to download and probe. Read-only: it downloads nothing.
 *
 * Usage:  pnpm --filter @equitywise/archive tg:list [howManyRecentMessages]
 */

function bytesToMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  const limitArg = Number(process.argv[2] ?? '200');
  const limit = Number.isInteger(limitArg) && limitArg > 0 ? limitArg : 200;

  const rows = await withClient(async (client) => {
    console.log(`Scanning the latest ${limit} document messages in ${CHANNEL_ID}...`);
    return listFiles(client, limit);
  });

  if (rows.length === 0) {
    console.log('No document files found in the scanned range.');
    return;
  }

  console.log(`\nFound ${rows.length} file(s), smallest first:\n`);
  for (const r of rows) {
    console.log(
      `  msgId=${r.messageId}  ${bytesToMb(r.bytes).padStart(12)}  ${r.date}  ${r.fileName}`,
    );
  }
  const smallest = rows[0];
  if (smallest) {
    console.log(
      `\nSmallest: msgId=${smallest.messageId} (${bytesToMb(smallest.bytes)}) ${smallest.fileName}`,
    );
    console.log('Paste this list back so we can choose one to download and probe.');
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
