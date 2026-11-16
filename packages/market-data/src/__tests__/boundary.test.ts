import { describe, expect, it } from 'vitest';
import { CODE_FILE_COUNT, codeHits } from './source-tree';

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

/** Files allowed to name a concrete provider, and why. */
const ALLOWED = [
  // The adapters. Their entire job is to hold both vocabularies at once.
  'packages/providers-fyers/',
  'packages/providers-dhan/',
  // The provider packages themselves.
  'packages/fyers/',
  'packages/dhan/',
  // Composition roots: they pick which provider to construct.
  'apps/web/src/server/provider.ts',
  // Operator scripts that drive the login flow directly.
  'scripts/',
];

/** TypeScript files (tests excluded) with `pattern` on a line of actual code. */
function grep(pattern: string): string[] {
  const hits = codeHits(pattern, (file) => file.endsWith('.ts') || file.endsWith('.tsx'));
  return [...new Set(hits.map((hit) => hit.file))];
}

function offenders(pattern: string): string[] {
  return grep(pattern).filter((file) => !ALLOWED.some((prefix) => file.startsWith(prefix)));
}

describe('provider boundary', () => {
  it('reads the source tree', () => {
    // Zero files would make every check below pass without looking at anything.
    expect(CODE_FILE_COUNT).toBeGreaterThan(500);
  });

  it('no route or page reaches for a provider adapter', () => {
    // Routes ask `@/server/provider`; only that composition root picks an adapter.
    const found = grep("from '@equitywise/providers-(fyers|dhan)'").filter((file) =>
      file.startsWith('apps/web/src/app/'),
    );
    expect(found).toEqual([]);
  });

  it('nothing outside the adapter imports the Fyers package', () => {
    expect(offenders("from '@equitywise/fyers'")).toEqual([]);
  });

  it('nothing outside the adapter imports the Dhan package', () => {
    expect(offenders("from '@equitywise/dhan'")).toEqual([]);
  });

  it('no Dhan addressing leaks into product code', () => {
    // `securityId` and the segment codes are Dhan's vocabulary. The product
    // speaks `RELIANCE` and `equity`.
    expect(offenders("securityId|'NSE_EQ'|'IDX_I'")).toEqual([]);
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
