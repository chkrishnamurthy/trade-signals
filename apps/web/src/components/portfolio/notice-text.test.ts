import { describe, expect, it } from 'vitest';
import type { NoticeDto } from '@/lib/portfolio-types';
import { noticeText, shareChangeWords } from './notice-text';

const notice = (kind: NoticeDto['kind'], data: NoticeDto['data']): NoticeDto => ({
  id: 1,
  kind,
  noticeDate: '2026-10-07',
  data,
  createdAt: '2026-10-05T15:00:00.000Z',
  read: false,
});

describe('noticeText', () => {
  it('words a dividend with the amount on the shares held', () => {
    const t = noticeText(
      notice('event_soon', {
        symbol: 'ITC',
        eventType: 'dividend',
        eventDate: '2026-10-07',
        dividendPaise: 1500,
        shares: 200,
        daysAway: 2,
      }),
    );
    expect(t.title).toBe('ITC: dividend ex-date in 2 days, 7 Oct 2026');
    expect(t.body).toContain('₹15.00 a share');
    expect(t.body).toContain('about ₹3,000');
  });
  it('words a move with its sign and the change on the shares held', () => {
    const t = noticeText(
      notice('stock_move', {
        symbol: 'TCS',
        session: '2026-10-05',
        changeRatio: -0.052,
        closePaise: 360_000,
        valueChangePaise: -197_500,
      }),
    );
    expect(t.title).toBe('TCS fell 5.2% on 5 Oct 2026');
    expect(t.body).toBe('Closed at ₹3,600.00. On the shares you hold, a change of −₹1,975.');
  });
  it('words a portfolio move and a purchase turning long term', () => {
    expect(
      noticeText(
        notice('portfolio_move', {
          session: '2026-10-05',
          changeRatio: 0.031,
          valueChangePaise: 1_234_500,
          stocks: 6,
        }),
      ).title,
    ).toBe('Your holdings rose 3.1% on 5 Oct 2026');
    expect(
      noticeText(
        notice('long_term_soon', {
          symbol: 'INFY',
          shares: 10,
          acquiredOn: '2025-10-08',
          longTermOn: '2026-10-09',
          daysAway: 1,
          bonus: 0,
        }),
      ).title,
    ).toBe('INFY: 10 shares become long term tomorrow, 9 Oct 2026');
  });
});

describe('shareChangeWords', () => {
  it('reads the price multiplier as people say it', () => {
    expect(shareChangeWords('bonus', 0.5)).toBe('1:1 bonus');
    expect(shareChangeWords('bonus', 2 / 3)).toBe('1:2 bonus');
    expect(shareChangeWords('split', 0.2)).toBe('1-into-5 split');
    expect(shareChangeWords('consolidation', 10)).toBe('10-into-1 consolidation');
  });
});
