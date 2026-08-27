import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Architecture guard.
 *
 * Broker independence is a property nothing enforces at runtime — it decays
 * the moment someone reaches for `@equitywise/fyers` because it is right there and
 * already has the function they want. This test is the enforcement.
 *
 * If it fails, the fix is to widen `MarketDataProvider`, not to add an
 * exception here.
 */

const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;

/** Files allowed to name a concrete provider, and why. */
const ALLOWED = [
  // The adapter. Its entire job is to hold both vocabularies at once.
  'packages/providers-fyers/',
  // The provider package itself.
  'packages/fyers/',
  // Composition roots: they pick which provider to construct.
  'apps/web/src/server/provider.ts',
  // Operator scripts that drive the login flow directly.
  'scripts/',
];

/** Comment lines. Prose explaining the rule must not trip the rule. */
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

/**
 * Files containing `pattern` on a line of actual code.
 *
 * Matches with line numbers rather than `-l`, so comment lines can be filtered
 * out before a file is judged.
 */
function grep(pattern: string): string[] {
  let out: string;
  try {
    out = execFileSync('git', ['grep', '-n', '-E', pattern, '--', '*.ts', '*.tsx', ':!*.test.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch {
    // git grep exits 1 when there are no matches. That is the passing case.
    return [];
  }

  const files = new Set<string>();
  for (const line of out.split('\n')) {
    if (line === '') continue;
    const [file, , ...rest] = line.split(':');
    const code = rest.join(':');
    if (file === undefined || COMMENT.test(code)) continue;
    files.add(file);
  }
  return [...files];
}

function offenders(pattern: string): string[] {
  return grep(pattern).filter((file) => !ALLOWED.some((prefix) => file.startsWith(prefix)));
}

describe('provider boundary', () => {
  it('nothing outside the adapter imports the Fyers package', () => {
    expect(offenders("from '@equitywise/fyers'")).toEqual([]);
  });

  it('no provider symbol format leaks into product code', () => {
    // `NSE:RELIANCE-EQ` is a Fyers encoding. The product speaks `RELIANCE`.
    expect(offenders('fyersSymbol|NSE:[A-Z]+-(EQ|INDEX)')).toEqual([]);
  });

  it('no order-execution vocabulary exists anywhere', () => {
    // This is a decision-support tool. It must never place, hold, or represent
    // an order (CLAUDE.md). Catching the words early is cheaper than
    // discovering a half-built order ticket later.
    const found = grep('placeOrder|cancelOrder|modifyOrder|orderBook|/positions|/holdings|/funds');
    expect(found).toEqual([]);
  });
});
