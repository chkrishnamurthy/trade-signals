import { describe, expect, it } from 'vitest';
import { appendLedger, ledgerDrafts, openingBalances, reconstructLedger } from './ledger.js';

/**
 * The worked example on a ₹2,00,000 book, 23 shares (see position.test.ts):
 *   opening +20,000,000
 *   reserve −6,827,255 → cash 13,172,745 / reserved 6,827,255
 *   release +6,827,255 → cash 20,000,000 / reserved 0
 *   entry −6,801,330 (23 × 2957.10) → cash 13,198,670 / locked 6,801,330
 *   exit T1 +3,275,470 (cost 3,252,810 + gross 22,660) → cash 16,474,140 / locked 3,548,520
 *   charges −3,476 → cash 16,470,664
 *   exit T2 +3,599,460 (cost 3,548,520 + gross 50,940) → cash 20,070,124 / locked 0
 *   charges −3,809 → cash 20,066,315 = opening + net 66,315
 */
describe('ledger', () => {
  it('records every balance after each entry and ends at opening + net', () => {
    const drafts = [
      ledgerDrafts.opening(1, 1, 20_000_000),
      ledgerDrafts.reserve(1, 7, 2, 6_827_255),
      ledgerDrafts.release(1, 7, 3, 6_827_255),
      ledgerDrafts.entry(1, 11, 3, 6_801_330),
      ledgerDrafts.exit(1, 12, 4, 3_275_470, 3_252_810),
      ledgerDrafts.charges(1, 12, 4, 3_476),
      ledgerDrafts.exit(1, 13, 5, 3_599_460, 3_548_520),
      ledgerDrafts.charges(1, 13, 5, 3_809),
    ];
    let balances = openingBalances();
    const entries = [];
    for (const d of drafts) {
      const r = appendLedger(balances, entries.length, d);
      balances = r.balances;
      entries.push(r.entry);
    }
    expect(
      entries.map((e) => [e.sequence, e.cashAfterPaise, e.reservedAfterPaise, e.lockedAfterPaise]),
    ).toEqual([
      [1, 20_000_000, 0, 0],
      [2, 13_172_745, 6_827_255, 0],
      [3, 20_000_000, 0, 0],
      [4, 13_198_670, 0, 6_801_330],
      [5, 16_474_140, 0, 3_548_520],
      [6, 16_470_664, 0, 3_548_520],
      [7, 20_070_124, 0, 0],
      [8, 20_066_315, 0, 0],
    ]);
    expect(balances).toEqual({ cashPaise: 20_066_315, reservedPaise: 0, lockedPaise: 0 });
    expect(entries[4]?.idempotencyKey).toBe('1:fill:12:EXIT:0');
    const check = reconstructLedger([...entries].reverse());
    expect(check.mismatches).toEqual([]);
    expect(check.balances).toEqual(balances);
  });
  it('refuses to go negative and detects a tampered balance', () => {
    expect(() => appendLedger(openingBalances(), 0, ledgerDrafts.reserve(1, 1, 1, 5))).toThrow(
      /negative/,
    );
    const first = appendLedger(openingBalances(), 0, ledgerDrafts.opening(1, 1, 100)).entry;
    expect(reconstructLedger([{ ...first, cashAfterPaise: 99 }]).mismatches).toEqual([
      { sequence: 1, field: 'cashAfterPaise', recorded: 99, computed: 100 },
    ]);
  });
});
