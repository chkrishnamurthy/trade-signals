import type { CalendarConfig, MarketCalendarConfig } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import { buildMarketCalendarRows, loadMarketCalendarConfigs } from './market-calendar-sync.js';

const exchange: CalendarConfig = {
  exchange: 'NSE',
  verifiedThrough: '2026-12-31',
  timings: { open: '09:15', close: '15:30', entryCutoff: '14:30', squareOff: '15:15' },
  holidays: [{ date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' }],
  specialSessions: [
    {
      date: '2026-11-08',
      kind: 'MUHURAT',
      name: 'Muhurat',
      open: '18:15',
      close: '19:15',
      entryCutoff: '18:45',
      squareOff: '19:05',
    },
  ],
};

const events: MarketCalendarConfig = {
  events: [
    {
      key: 'config:result:TCS:2026-Q2',
      symbol: ' tcs ',
      event_type: 'result',
      title: 'TCS quarterly results',
      event_date: '2026-10-10',
      event_time: '09:30',
      why_this_matters: 'Reported figures update the public company record.',
    },
    {
      key: 'config:ipo:UNKNOWN:2026',
      symbol: 'unknown',
      event_type: 'ipo',
      title: 'Example IPO event',
      event_date: '2026-10-12',
    },
  ],
};

describe('market calendar rows', () => {
  it('loads the checked-in event and exchange configs through their Zod boundaries', async () => {
    const configs = await loadMarketCalendarConfigs();
    expect(configs.events.events.length).toBeGreaterThan(0);
    expect(configs.exchange.holidays.length).toBeGreaterThan(0);
  });

  it('resolves known symbols, preserves unknown symbols and derives holidays', () => {
    const rows = buildMarketCalendarRows(events, exchange, new Map([['TCS', 42]]));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ symbol: 'TCS', instrumentId: 42, eventType: 'result' });
    expect(rows[0]?.eventTime?.toISOString()).toBe('2026-10-10T04:00:00.000Z');
    expect(rows[1]).toMatchObject({ symbol: 'UNKNOWN', instrumentId: null, eventType: 'ipo' });
    expect(rows[2]).toMatchObject({
      sourceKey: 'nse-holiday:2026-10-02',
      eventType: 'market_holiday',
      eventTime: null,
    });
    expect(rows.some((row) => row.sourceKey.includes('2026-11-08'))).toBe(false);
  });

  it('rejects a collision between configured and derived keys', () => {
    expect(() =>
      buildMarketCalendarRows(
        {
          events: [
            {
              key: 'nse-holiday:2026-10-02',
              event_type: 'corporate_announcement',
              title: 'Collision',
              event_date: '2026-10-02',
            },
          ],
        },
        exchange,
        new Map(),
      ),
    ).toThrow('Duplicate market event key');
  });
});
