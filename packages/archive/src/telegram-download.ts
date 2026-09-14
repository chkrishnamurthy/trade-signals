import { createHash } from 'node:crypto';
import { bufferSource, probeFeatherSource } from './feather-probe.js';
import { nativeSchema, nativeSummary } from './native-feather.js';
import { downloadDocument, withClient } from './telegram-client.js';

/**
 * Download one selected message's file and inspect it: envelope probe, then the
 * native (pyarrow) schema and a shape summary so we can see the real columns,
 * row count and data spread.
 *
 * Usage:  pnpm --filter @equitywise/archive tg:get <messageId>
 */
async function main(): Promise<void> {
  const messageId = Number(process.argv[2]);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    throw new Error('Usage: tg:get <messageId>');
  }

  const { result, buffer } = await withClient(async (client) => {
    console.log(`Downloading msgId=${messageId}...`);
    return downloadDocument(client, messageId);
  });

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  console.log(`Saved ${result.bytes} bytes to ${result.path}`);
  console.log(`sha256: ${sha256}\n`);

  const probe = await probeFeatherSource(bufferSource(buffer));
  console.log('Envelope probe:', JSON.stringify(probe, null, 2));
  if (probe.format !== 'feather_v2_or_arrow_ipc' || !probe.envelopeConsistent) {
    console.log('\nNot a consistent Feather V2 file — stopping.');
    return;
  }

  const schema = await nativeSchema(result.path);
  console.log(`\nSchema: ${schema.num_rows} rows in ${schema.num_batches} batch(es)`);
  for (const f of schema.fields) {
    console.log(`  ${f.name}: ${f.type}${f.nullable ? ' (nullable)' : ''}`);
  }

  const summary = await nativeSummary(result.path);
  console.log('\nSummary:', JSON.stringify(summary, null, 2));
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
