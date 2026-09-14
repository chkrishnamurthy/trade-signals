import { execFileSync } from 'node:child_process';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../../scripts/archive/feather-probe.pl', import.meta.url),
);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture(size: number, v1 = false) {
  const root = await mkdtemp(join(tmpdir(), 'equitywise-feather-probe-'));
  roots.push(root);
  const path = join(root, 'sample.feather');
  const file = await open(path, 'wx');
  await file.truncate(size);
  const magic = Buffer.from(v1 ? 'FEA1' : 'ARROW1');
  const tail = Buffer.alloc(4 + magic.length);
  tail.writeUInt32LE(4, 0);
  magic.copy(tail, 4);
  await file.write(magic, 0, magic.length, 0);
  await file.write(tail, 0, tail.length, size - tail.length);
  await file.close();
  return path;
}
function probe(path: string) {
  return JSON.parse(
    execFileSync('perl', [script, path], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    }),
  ) as {
    format: string;
    file_bytes: string;
    bytes_read: number;
    envelope_consistent: boolean;
    schema_validated: boolean;
  };
}
describe('Perl Feather envelope probe', () => {
  it('inspects a sparse 5 GiB input with only 16 bytes of file reads', async () => {
    const result = probe(await fixture(5 * 1024 ** 3));
    expect(result).toMatchObject({
      format: 'feather_v2_or_arrow_ipc',
      file_bytes: String(5 * 1024 ** 3),
      bytes_read: 16,
      envelope_consistent: true,
      schema_validated: false,
    });
  });
  it('distinguishes legacy Feather from IPC without claiming schema compatibility', async () => {
    expect(probe(await fixture(32, true))).toMatchObject({
      format: 'feather_v1',
      envelope_consistent: true,
      schema_validated: false,
    });
  });
  it('rejects a truncated footer envelope', async () => {
    const path = await fixture(32);
    const file = await open(path, 'r+');
    await file.truncate(20);
    await file.close();
    expect(() => probe(path)).toThrow();
  });
});
