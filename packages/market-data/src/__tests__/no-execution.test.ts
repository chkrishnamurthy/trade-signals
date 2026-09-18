import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Execution guard (CLAUDE.md "Do not build order execution of any kind";
 * docs/planning/paper-trading-plan.md §15).
 *
 * Paper trading is a simulation in our own database. Nothing in this tree may
 * name a broker order, position, holdings or funds endpoint, or an order
 * credential — not even read-only, not even behind a flag. This test is the
 * enforcement: it greps every source file (tests and docs excluded) for the
 * vocabulary of both brokers' execution APIs and fails on any line of code.
 *
 * If it fails, the fix is to delete the code, never to widen this list.
 */
const REPO_ROOT = new URL('../../../../', import.meta.url).pathname;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

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

function codeHits(pattern: string): string[] {
  let out: string;
  try {
    out = execFileSync(
      'git',
      [
        'grep',
        '-n',
        '-E',
        pattern,
        '--',
        '*.ts',
        '*.tsx',
        '*.js',
        '*.mjs',
        '*.yaml',
        ':!*.test.ts',
        ':!docs/',
        ':!*.md',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
  } catch {
    return [];
  }
  const hits: string[] = [];
  for (const line of out.split('\n')) {
    if (line === '') continue;
    const [file, lineNo, ...rest] = line.split(':');
    const code = rest.join(':');
    if (file === undefined || COMMENT.test(code)) continue;
    hits.push(`${file}:${lineNo}`);
  }
  return hits;
}

describe('no order execution anywhere in the tree', () => {
  for (const { pattern, why } of FORBIDDEN) {
    it(`contains no ${why} (${pattern})`, () => {
      expect(codeHits(pattern)).toEqual([]);
    });
  }
  it('the Dhan package has no order, portfolio or funds module', () => {
    const files = execFileSync(
      'git',
      ['ls-files', 'packages/dhan/src', 'packages/providers-dhan/src'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      },
    )
      .split('\n')
      .map((f) => f.split('/').at(-1) ?? '');
    expect(
      files.filter((f) => /order|position|holding|fund|margin|trade-?book|ledger/i.test(f)),
    ).toEqual([]);
  });
});
