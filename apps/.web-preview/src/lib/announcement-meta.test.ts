import { describe, expect, it } from 'vitest';
import {
  announcementMeta,
  HIGH_IMPACT_PATTERNS,
  isDateRange,
  rangeSince,
  relativeDayBucket,
} from './announcement-meta';

describe('announcementMeta', () => {
  it('classifies results as a key-filing neutral bucket', () => {
    const meta = announcementMeta('Result', 'Q2 FY27 results approved');
    expect(meta.bucket).toBe('results');
    expect(meta.highImpact).toBe(true);
    expect(meta.tone).toBe('neutral');
  });

  it('detects the bucket from the headline when the category is null', () => {
    expect(announcementMeta(null, 'Interim dividend declared').bucket).toBe('dividend');
    expect(announcementMeta(null, 'Board meeting intimation').bucket).toBe('board_meeting');
    expect(announcementMeta(null, 'Buy-back of equity shares').bucket).toBe('buyback');
  });

  it('flags a stock split as high impact', () => {
    expect(announcementMeta('Corp. Action', 'Sub-division of face value').highImpact).toBe(true);
  });

  it('falls back to a neutral non-impact bucket for routine updates', () => {
    const meta = announcementMeta('Compliance', 'Trading window closure');
    expect(meta.bucket).toBe('other');
    expect(meta.highImpact).toBe(false);
  });

  it('treats ratings and management changes as non-high-impact', () => {
    expect(announcementMeta('Credit Rating', 'Rating reaffirmed').highImpact).toBe(false);
    expect(announcementMeta(null, 'Resignation of director').highImpact).toBe(false);
  });
});

describe('HIGH_IMPACT_PATTERNS', () => {
  it('are wrapped ILIKE patterns covering the impactful keywords', () => {
    expect(HIGH_IMPACT_PATTERNS).toContain('%dividend%');
    expect(HIGH_IMPACT_PATTERNS).toContain('%result%');
    expect(HIGH_IMPACT_PATTERNS.every((p) => p.startsWith('%') && p.endsWith('%'))).toBe(true);
  });
});

describe('isDateRange', () => {
  it('accepts the known ranges and rejects others', () => {
    expect(isDateRange('today')).toBe(true);
    expect(isDateRange('week')).toBe(true);
    expect(isDateRange('nonsense')).toBe(false);
  });
});

describe('rangeSince', () => {
  // 2026-09-13 is a Sunday; 09:00 UTC = 14:30 IST, same IST calendar day.
  const now = new Date('2026-09-13T09:00:00Z');

  it('returns null for "all"', () => {
    expect(rangeSince('all', now)).toBeNull();
  });

  it('anchors "today" at the start of the IST day', () => {
    // Start of 2026-09-13 IST = 2026-09-12T18:30:00Z.
    expect(rangeSince('today', now)?.toISOString()).toBe('2026-09-12T18:30:00.000Z');
  });

  it('goes back 7 IST days for "week" and 30 for "month"', () => {
    // Each is a UTC instant that is midnight IST (00:00 IST = 18:30 UTC the day before):
    // 6 IST days back → start of 2026-09-07 IST; 29 back → start of 2026-08-15 IST.
    expect(rangeSince('week', now)?.toISOString()).toBe('2026-09-06T18:30:00.000Z');
    expect(rangeSince('month', now)?.toISOString()).toBe('2026-08-14T18:30:00.000Z');
  });
});

describe('relativeDayBucket', () => {
  const now = new Date('2026-09-13T09:00:00Z'); // 2026-09-13 IST

  it('buckets same-day as today', () => {
    expect(relativeDayBucket('2026-09-13T04:00:00Z', now)).toBe('today');
  });

  it('buckets the previous IST day as yesterday', () => {
    // 2026-09-12T10:00:00Z = 2026-09-12 15:30 IST.
    expect(relativeDayBucket('2026-09-12T10:00:00Z', now)).toBe('yesterday');
  });

  it('buckets within the last week, then earlier', () => {
    expect(relativeDayBucket('2026-09-09T10:00:00Z', now)).toBe('week');
    expect(relativeDayBucket('2026-08-20T10:00:00Z', now)).toBe('earlier');
  });
});
