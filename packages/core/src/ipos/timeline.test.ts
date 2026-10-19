import type { CalendarConfig } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import {
  addSettlementDays,
  closedStage,
  expectedTimeline,
  ipoStatus,
  ipoTimeline,
  lifecycleFromSourceStatus,
  listingUnconfirmed,
} from './timeline.js';

const CALENDAR: CalendarConfig = {
  exchange: 'NSE',
  verifiedThrough: '2026-12-31',
  timings: { open: '09:15', close: '15:30', entryCutoff: '14:30', squareOff: '15:15' },
  holidays: [
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2026-11-09', name: 'Diwali Balipratipada' },
  ],
  specialSessions: [
    {
      date: '2026-11-08',
      kind: 'MUHURAT',
      name: 'Muhurat trading',
      open: '18:00',
      close: '19:00',
      entryCutoff: '18:30',
      squareOff: '18:45',
    },
  ],
};

const dates = (open: string | null, close: string | null, listing: string | null = null) => ({
  openDate: open,
  closeDate: close,
  listingDate: listing,
  lifecycleOverride: null,
});

describe('ipoStatus', () => {
  const issue = dates('2026-09-30', '2026-10-05');
  it('walks upcoming → open → closed', () => {
    expect(ipoStatus(issue, '2026-09-29')).toBe('upcoming');
    expect(ipoStatus(issue, '2026-09-30')).toBe('open');
    expect(ipoStatus(issue, '2026-10-05')).toBe('open');
    expect(ipoStatus(issue, '2026-10-06')).toBe('closed');
  });
  it('is listed only from the OFFICIAL listing date', () => {
    const listed = dates('2026-09-24', '2026-09-28', '2026-10-01');
    expect(ipoStatus(listed, '2026-09-30')).toBe('closed');
    expect(ipoStatus(listed, '2026-10-01')).toBe('listed');
  });
  it('is upcoming while dates are unannounced', () => {
    expect(ipoStatus(dates(null, null), '2026-10-02')).toBe('upcoming');
  });
  it('honours a source withdrawal', () => {
    expect(ipoStatus({ ...issue, lifecycleOverride: 'withdrawn' }, '2026-10-01')).toBe('withdrawn');
  });
});

describe('settlement days', () => {
  it('skips weekends and holidays', () => {
    // Thu 1 Oct + 1 → Fri 2 Oct is Gandhi Jayanti → Mon 5 Oct.
    expect(addSettlementDays('2026-10-01', 1, CALENDAR)).toBe('2026-10-05');
  });
  it('does not count a Muhurat session as a settlement day', () => {
    // Fri 6 Nov + 1: Sat 7, Sun 8 (Muhurat), Mon 9 holiday → Tue 10 Nov.
    expect(addSettlementDays('2026-11-06', 1, CALENDAR)).toBe('2026-11-10');
  });
});

describe('expectedTimeline (SEBI T+3)', () => {
  it('counts T+1, T+2, T+3 in settlement days from close', () => {
    // VNL closes Mon 5 Oct: T+1 Tue 6, T+2 Wed 7, T+3 Thu 8 Oct.
    expect(expectedTimeline('2026-10-05', CALENDAR)).toEqual({
      allotment: '2026-10-06',
      refunds: '2026-10-07',
      dematCredit: '2026-10-07',
      listing: '2026-10-08',
    });
  });
  it('steps over a holiday inside the window', () => {
    // Close Wed 30 Sep: T+1 Thu 1 Oct, T+2 Mon 5 (2 Oct holiday + weekend), T+3 Tue 6.
    expect(expectedTimeline('2026-09-30', CALENDAR)).toEqual({
      allotment: '2026-10-01',
      refunds: '2026-10-05',
      dematCredit: '2026-10-05',
      listing: '2026-10-06',
    });
  });
});

describe('closedStage', () => {
  const issue = { ...dates('2026-09-30', '2026-10-05'), allotmentDate: null };
  it('moves from allotment pending to listing pending', () => {
    expect(closedStage(issue, '2026-10-05', CALENDAR)).toBeNull();
    expect(closedStage(issue, '2026-10-06', CALENDAR)).toBe('allotment_done');
    expect(closedStage({ ...issue, closeDate: '2026-10-05' }, '2026-10-07', CALENDAR)).toBe(
      'listing_pending',
    );
  });
  it('is allotment pending between close and T+1', () => {
    const fri = { ...dates('2026-09-28', '2026-10-01'), allotmentDate: null };
    // Closed Thu 1 Oct; T+1 is Mon 5 Oct; on Sat 3 Oct allotment is pending.
    expect(closedStage(fri, '2026-10-03', CALENDAR)).toBe('allotment_pending');
  });
});

describe('ipoTimeline', () => {
  it('marks computed dates as expected and stated ones as official', () => {
    const events = ipoTimeline(
      {
        ...dates('2026-09-24', '2026-09-28', '2026-10-01'),
        allotmentDate: null,
        refundDate: null,
        dematCreditDate: null,
      },
      '2026-09-30',
      CALENDAR,
    );
    expect(events.map((e) => [e.kind, e.date, e.expected, e.done])).toEqual([
      ['opens', '2026-09-24', false, true],
      ['closes', '2026-09-28', false, true],
      ['allotment', '2026-09-29', true, true],
      ['refunds', '2026-09-30', true, false],
      ['demat_credit', '2026-09-30', true, false],
      ['listing', '2026-10-01', false, false],
    ]);
  });
  it('has no future milestones for a withdrawn issue', () => {
    const events = ipoTimeline(
      {
        ...dates('2026-10-10', '2026-10-14'),
        lifecycleOverride: 'withdrawn',
        allotmentDate: null,
        refundDate: null,
        dematCreditDate: null,
      },
      '2026-10-02',
      CALENDAR,
    );
    expect(events.map((e) => e.kind)).toEqual(['opens', 'closes']);
  });
});

describe('lifecycleFromSourceStatus', () => {
  it('reads only an explicit withdrawal or postponement', () => {
    expect(lifecycleFromSourceStatus('Withdrawn')).toBe('withdrawn');
    expect(lifecycleFromSourceStatus('Issue Cancelled')).toBe('withdrawn');
    expect(lifecycleFromSourceStatus('Postponed')).toBe('postponed');
    expect(lifecycleFromSourceStatus('Deferred')).toBe('postponed');
    for (const word of ['Active', 'Forthcoming', 'Live', 'Closed', '', null, undefined])
      expect(lifecycleFromSourceStatus(word)).toBeNull();
  });
});

describe('listing not reported', () => {
  // Close Mon 5 Oct → expected listing T+3 = Thu 8 Oct; +5 settlement days of
  // grace = Fri 9, Mon 12, Tue 13, Wed 14, Thu 15 Oct. Hand-counted.
  const issue = { ...dates('2026-09-30', '2026-10-05'), allotmentDate: null };
  it('stays "listing next" through the grace window', () => {
    expect(listingUnconfirmed(issue, '2026-10-15', CALENDAR)).toBe(false);
    expect(closedStage(issue, '2026-10-15', CALENDAR)).toBe('listing_pending');
  });
  it('says no listing was reported after it, never "withdrawn"', () => {
    expect(listingUnconfirmed(issue, '2026-10-16', CALENDAR)).toBe(true);
    expect(closedStage(issue, '2026-10-16', CALENDAR)).toBe('listing_unconfirmed');
    expect(ipoStatus(issue, '2026-10-16')).toBe('closed');
  });
  it('drops the expected listing date from the timeline once it has passed unconfirmed', () => {
    const input = { ...issue, refundDate: null, dematCreditDate: null };
    const kinds = (today: string) => ipoTimeline(input, today, CALENDAR).map((e) => e.kind);
    expect(kinds('2026-10-15')).toContain('listing');
    expect(kinds('2026-10-16')).not.toContain('listing');
  });
  it('never applies to an issue with an official listing date', () => {
    const listed = { ...dates('2026-09-30', '2026-10-05', '2026-10-20'), allotmentDate: null };
    expect(listingUnconfirmed(listed, '2026-10-19', CALENDAR)).toBe(false);
  });
});
