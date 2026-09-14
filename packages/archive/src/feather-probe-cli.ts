#!/usr/bin/env node
import { probeFeatherFile } from './feather-probe.js';

/**
 * Command-line Feather/Arrow envelope probe. Prints the probe result as JSON and
 * exits 0 when the container envelope is consistent, 2 otherwise. Reads only the
 * head and tail of the file — safe to run against a multi-gigabyte archive.
 *
 * Usage: tsx src/feather-probe-cli.ts FILE.feather
 */
async function main(): Promise<number> {
  const [, , path, ...rest] = process.argv;
  if (!path || rest.length > 0) {
    process.stderr.write('Usage: feather-probe FILE.feather\n');
    return 64; // EX_USAGE
  }
  const result = await probeFeatherFile(path);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.envelopeConsistent ? 0 : 2;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  },
);
