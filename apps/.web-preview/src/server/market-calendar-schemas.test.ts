import { describe, expect, it } from 'vitest';
import { marketCalendarQuerySchema } from './market-calendar-schemas.js';

describe('market calendar query', () => {
  it('defaults the optional watchlist filter to false', () => {
    expect(marketCalendarQuerySchema.parse({})).toEqual({ watchlistOnly: false });
  });

  it('accepts inclusive dates, a supported type and an explicit watchlist filter', () => {
    expect(
      marketCalendarQuerySchema.parse({
        from: '2026-10-01',
        to: '2026-10-31',
        eventType: 'result',
        watchlistOnly: 'true',
      }),
    ).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      eventType: 'result',
      watchlistOnly: true,
    });
  });

  it.each([
    { from: '2026-10-01' },
    { from: '2026-10-02', to: '2026-10-01' },
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-01-01', to: '2027-01-02' },
    { eventType: 'conference' },
    { watchlistOnly: 'yes' },
    { extra: 'value' },
  ])('rejects invalid filters: %j', (value) => {
    expect(marketCalendarQuerySchema.safeParse(value).success).toBe(false);
  });
});
