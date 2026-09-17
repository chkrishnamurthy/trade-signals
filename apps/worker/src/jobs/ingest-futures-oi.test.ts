import type { FuturesOiBar } from '@equitywise/market-data';
import { describe, expect, it } from 'vitest';
import { summariseSessions, toUpsertRows } from './ingest-futures-oi.js';

const bar = (date: string, expiry: string, close: number, oi: number): FuturesOiBar => ({
  timestamp: Date.parse(`${date}T00:00:00Z`),
  expiry,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
  openInterest: oi,
});

describe('summariseSessions', () => {
  it('sums OI across expiries and takes the near contract that is still alive', () => {
    const sessions = summariseSessions([
      bar('2026-09-28', '2026-09-29', 124_000, 100),
      bar('2026-09-28', '2026-10-27', 124_500, 50),
      bar('2026-09-28', '2026-11-23', 125_000, 10),
      // Expiry day: the September contract settles.
      bar('2026-09-29', '2026-09-29', 124_100, 5),
      bar('2026-09-29', '2026-10-27', 124_600, 140),
      // After expiry, September is gone from the master; October is near.
      bar('2026-09-30', '2026-10-27', 124_900, 150),
      bar('2026-09-30', '2026-11-23', 125_300, 20),
    ]);
    expect(sessions).toEqual([
      {
        tradingDate: '2026-09-28',
        futuresOi: 160,
        nearExpiry: '2026-09-29',
        futuresClosePaise: 124_000,
        contracts: 3,
      },
      {
        tradingDate: '2026-09-29',
        futuresOi: 145,
        nearExpiry: '2026-09-29',
        futuresClosePaise: 124_100,
        contracts: 2,
      },
      {
        tradingDate: '2026-09-30',
        futuresOi: 170,
        nearExpiry: '2026-10-27',
        futuresClosePaise: 124_900,
        contracts: 2,
      },
    ]);
  });
});

describe('toUpsertRows', () => {
  it('diffs each session against the previous and never writes the first', () => {
    const rows = toUpsertRows(
      7,
      [
        {
          tradingDate: '2026-09-14',
          futuresOi: 1000,
          nearExpiry: 'e',
          futuresClosePaise: 100,
          contracts: 3,
        },
        {
          tradingDate: '2026-09-15',
          futuresOi: 1100,
          nearExpiry: 'e',
          futuresClosePaise: 110,
          contracts: 3,
        },
        {
          tradingDate: '2026-09-16',
          futuresOi: 1050,
          nearExpiry: 'e',
          futuresClosePaise: 120,
          contracts: 3,
        },
        {
          tradingDate: '2026-09-17',
          futuresOi: 1050,
          nearExpiry: 'e',
          futuresClosePaise: 130,
          contracts: 3,
        },
      ],
      'dhan',
    );
    expect(rows.map((r) => [r.tradingDate, r.oiChange, r.closeChangePaise, r.buildup])).toEqual([
      ['2026-09-15', 100, 10, 'long_buildup'],
      ['2026-09-16', -50, 10, 'short_covering'],
      ['2026-09-17', 0, 10, null],
    ]);
    expect(rows[0]).toMatchObject({ instrumentId: 7, source: 'dhan', futuresOi: 1100 });
  });

  it('writes nothing from a single session', () => {
    expect(
      toUpsertRows(
        1,
        [{ tradingDate: 'd', futuresOi: 1, nearExpiry: 'e', futuresClosePaise: 1, contracts: 1 }],
        'dhan',
      ),
    ).toEqual([]);
  });
});
