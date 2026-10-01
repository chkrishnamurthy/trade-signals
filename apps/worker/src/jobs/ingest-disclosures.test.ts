import { describe, expect, it } from 'vitest';
import { announcementWindowStart } from './ingest-disclosures.js';

describe('announcementWindowStart', () => {
  const now = new Date('2026-10-01T13:50:00Z');

  it('reaches back three days on the first run', () => {
    expect(announcementWindowStart(now, null).toISOString()).toBe('2026-09-28T13:50:00.000Z');
  });

  it('re-reads two hours before the last successful run', () => {
    const lastSuccess = new Date('2026-10-01T10:50:00Z');
    expect(announcementWindowStart(now, lastSuccess).toISOString()).toBe(
      '2026-10-01T08:50:00.000Z',
    );
  });

  it('never reaches back further than three days, however long the outage', () => {
    const lastSuccess = new Date('2026-09-20T10:50:00Z');
    expect(announcementWindowStart(now, lastSuccess).toISOString()).toBe(
      '2026-09-28T13:50:00.000Z',
    );
  });
});
