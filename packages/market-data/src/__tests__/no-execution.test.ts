import { describe, expect, it } from 'vitest';
import { ALL_FILES, CODE_FILE_COUNT, codeHits } from './source-tree';

/**
 * Execution guard (CLAUDE.md "Do not build order execution of any kind").
 *
 * Nothing in this tree may name a broker order, position, holdings or funds
 * endpoint, or an order credential — not even read-only, not even behind a
 * flag. This test is the enforcement: it reads every source file (tests and
 * docs excluded) for the vocabulary of both brokers' execution APIs and fails
 * on any line of code.
 *
 * If it fails, the fix is to delete the code, never to widen this list.
 */
/** Patterns, each with the reason it is forbidden. */
const FORBIDDEN: readonly { pattern: string; why: string }[] = [
  { pattern: '/v2/orders|/v2/super/orders|/v2/forever/orders', why: 'Dhan order endpoints' },
  {
    pattern: '/v2/positions|/v2/holdings|/v2/fundlimit|/v2/margincalculator',
    why: 'Dhan portfolio/funds endpoints',
  },
  { pattern: '/v2/trades|/v2/ledger', why: 'Dhan trade book / ledger endpoints' },
  {
    pattern: 'api/v3/orders|api/v3/positions|api/v3/holdings|api/v3/funds|api/v3/tradebook',
    why: 'Fyers order/portfolio endpoints',
  },
  {
    pattern: '\\b(placeOrder|modifyOrder|cancelOrder|place_order|modify_order|cancel_order)\\b',
    why: 'order SDK methods',
  },
  {
    pattern: '\\b(TRADING_PIN|tradingPin|DHAN_TRADING_PIN|FYERS_TRADING_PIN)\\b',
    why: 'an order credential',
  },
  {
    pattern: 'transactionType.*(BUY|SELL).*productType|productType.*INTRADAY.*orderType',
    why: 'an order request body',
  },
  { pattern: '\\bexchangeOrderId\\b|\\borderStatus\\b', why: 'broker order state' },
];

/** Docs and Markdown are prose about the rule; only code can break it. */
function hits(pattern: string): string[] {
  return codeHits(pattern).map(({ file, line }) => `${file}:${line}`);
}

describe('no order execution anywhere in the tree', () => {
  for (const { pattern, why } of FORBIDDEN) {
    it(`contains no ${why} (${pattern})`, () => {
      expect(hits(pattern)).toEqual([]);
    });
  }
  it('finds the source tree', () => {
    expect(CODE_FILE_COUNT).toBeGreaterThan(500);
  });
  it('the Dhan package has no order, portfolio or funds module', () => {
    const files = ALL_FILES.filter(
      (file) =>
        file.startsWith('packages/dhan/src/') || file.startsWith('packages/providers-dhan/src/'),
    ).map((file) => file.split('/').at(-1) ?? '');
    // An empty list would mean the walk found nothing, not that the tree is clean.
    expect(files.length).toBeGreaterThan(0);
    expect(
      files.filter((f) => /order|position|holding|fund|margin|trade-?book|ledger/i.test(f)),
    ).toEqual([]);
  });
});
