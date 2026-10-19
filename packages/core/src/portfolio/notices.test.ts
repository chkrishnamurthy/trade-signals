import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTICE_SETTINGS, holdingNotices, type NoticeInput } from './notices.js';

const today = '2026-10-05';
const base: NoticeInput = {
  today,
  settings: DEFAULT_NOTICE_SETTINGS,
  holdings: [
    { instrumentId: 1, symbol: 'ITC', name: 'ITC', shares: 200 },
    { instrumentId: 2, symbol: 'TCS', name: 'TCS', shares: 10 },
  ],
  events: [],
  changes: [],
  closes: new Map(),
  lots: [],
};

const kinds = (input: Partial<NoticeInput>) =>
  holdingNotices({ ...base, ...input }).map((n) => [n.kind, n.dedupeKey]);

describe('holdingNotices', () => {
  it('tells of an event within three days on a held stock, and nothing for others', () => {
    const notices = holdingNotices({
      ...base,
      events: [
        {
          instrumentId: 1,
          eventType: 'dividend',
          eventDate: '2026-10-08',
          title: 'Final dividend',
          dividendPaise: 785,
        },
        {
          instrumentId: 1,
          eventType: 'result',
          eventDate: '2026-10-09',
          title: 'Results',
          dividendPaise: null,
        },
        {
          instrumentId: 9,
          eventType: 'dividend',
          eventDate: '2026-10-06',
          title: 'Not held',
          dividendPaise: 100,
        },
      ],
    });
    expect(notices).toEqual([
      {
        kind: 'event_soon',
        instrumentId: 1,
        dedupeKey: '1|dividend|2026-10-08',
        noticeDate: '2026-10-08',
        data: expect.objectContaining({ dividendPaise: 785, shares: 200, daysAway: 3 }),
      },
    ]);
  });

  it('tells of a split or bonus that took effect in the last three days, with the shares now', () => {
    const notices = holdingNotices({
      ...base,
      changes: [
        { instrumentId: 1, kind: 'bonus', exDate: '2026-10-05', ratio: 0.5 },
        { instrumentId: 1, kind: 'split', exDate: '2026-09-01', ratio: 0.2 },
        { instrumentId: 2, kind: 'dividend', exDate: '2026-10-05', ratio: 1 },
      ],
    });
    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'share_change',
        dedupeKey: '1|bonus|2026-10-05',
        data: expect.objectContaining({ changeKind: 'bonus', ratio: 0.5, sharesNow: 200 }),
      }),
    ]);
  });

  it('tells of a stock move at or past the level, after taking out a split on that day', () => {
    // ITC 400 → 380 (−5%). TCS 1-into-2 split on the day: 4,000 → 2,040 is +2%, not −49%.
    const notices = holdingNotices({
      ...base,
      changes: [{ instrumentId: 2, kind: 'split', exDate: '2026-10-05', ratio: 0.5 }],
      closes: new Map([
        [1, { closePaise: 38_000, previousClosePaise: 40_000, session: '2026-10-05' }],
        [2, { closePaise: 204_000, previousClosePaise: 400_000, session: '2026-10-05' }],
      ]),
      settings: { ...DEFAULT_NOTICE_SETTINGS, shareChanges: false },
    });
    const move = notices.filter((n) => n.kind === 'stock_move');
    expect(move).toEqual([
      expect.objectContaining({
        instrumentId: 1,
        dedupeKey: '1|2026-10-05',
        data: expect.objectContaining({
          changeRatio: expect.closeTo(-0.05, 12),
          valueChangePaise: -400_000,
        }),
      }),
    ]);
  });

  it('tells of a portfolio move at or past its level across stocks with the same session', () => {
    // 200 × 400 → 380 = −₹4,000; 10 × 2,000 → 2,040 (after split) = +₹400; −₹3,600 of ₹1,00,000 = −3.6%.
    const notices = holdingNotices({
      ...base,
      changes: [{ instrumentId: 2, kind: 'split', exDate: '2026-10-05', ratio: 0.5 }],
      closes: new Map([
        [1, { closePaise: 38_000, previousClosePaise: 40_000, session: '2026-10-05' }],
        [2, { closePaise: 204_000, previousClosePaise: 400_000, session: '2026-10-05' }],
      ]),
      settings: { ...DEFAULT_NOTICE_SETTINGS, stockMoves: false, shareChanges: false },
    });
    expect(notices).toEqual([
      expect.objectContaining({
        kind: 'portfolio_move',
        instrumentId: null,
        dedupeKey: '2026-10-05',
        data: expect.objectContaining({
          changeRatio: expect.closeTo(-0.036, 12),
          valueChangePaise: -360_000,
          stocks: 2,
        }),
      }),
    ]);
  });

  it('gives no portfolio move when most holdings have no close that session', () => {
    const notices = holdingNotices({
      ...base,
      holdings: [
        ...base.holdings,
        { instrumentId: 3, symbol: 'C', name: 'C', shares: 1 },
        { instrumentId: 4, symbol: 'D', name: 'D', shares: 1 },
      ],
      closes: new Map([
        [1, { closePaise: 30_000, previousClosePaise: 40_000, session: '2026-10-05' }],
        [2, { closePaise: 100, previousClosePaise: 100, session: '2026-10-02' }],
        [3, { closePaise: 100, previousClosePaise: 100, session: '2026-10-02' }],
        [4, { closePaise: 100, previousClosePaise: 100, session: '2026-10-02' }],
      ]),
    });
    expect(notices.map((n) => n.kind)).toEqual(['stock_move']);
  });

  it('ignores a stale session and moves under the level', () => {
    expect(
      kinds({
        closes: new Map([
          [1, { closePaise: 30_000, previousClosePaise: 40_000, session: '2026-09-20' }],
        ]),
      }),
    ).toEqual([]);
    expect(
      kinds({
        closes: new Map([
          [1, { closePaise: 39_000, previousClosePaise: 40_000, session: '2026-10-05' }],
        ]),
      }),
    ).toEqual([]);
  });

  it('tells of a purchase turning long term within the chosen days, once per lot', () => {
    const notices = holdingNotices({
      ...base,
      lots: [
        {
          instrumentId: 1,
          acquiredOn: '2025-10-08',
          trackedFrom: '2025-10-08',
          shares: 50,
          bonus: false,
        },
        {
          instrumentId: 1,
          acquiredOn: '2025-12-01',
          trackedFrom: '2025-12-01',
          shares: 50,
          bonus: false,
        },
        {
          instrumentId: 1,
          acquiredOn: '2025-10-06',
          trackedFrom: '2025-10-06',
          shares: 50,
          bonus: true,
        },
      ],
    });
    expect(notices.map((n) => [n.dedupeKey, n.data.longTermOn])).toEqual([
      ['1|2025-10-08|2025-10-08|paid', '2026-10-09'],
      ['1|2025-10-06|2025-10-06|bonus', '2026-10-07'],
    ]);
  });

  it('respects settings that are switched off', () => {
    expect(
      kinds({
        settings: { ...DEFAULT_NOTICE_SETTINGS, events: false },
        events: [
          {
            instrumentId: 1,
            eventType: 'dividend',
            eventDate: '2026-10-06',
            title: 'x',
            dividendPaise: 1,
          },
        ],
      }),
    ).toEqual([]);
  });
});
