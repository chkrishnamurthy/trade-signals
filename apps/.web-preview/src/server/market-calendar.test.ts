import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  listInstrumentsById: vi.fn(),
  listMarketEvents: vi.fn(),
  listOwnerWatchedInstrumentIds: vi.fn(),
  marketEventSummary: vi.fn(),
}));

vi.mock('@equitywise/db', () => ({
  listInstrumentsById: mocks.listInstrumentsById,
  listMarketEvents: mocks.listMarketEvents,
  listOwnerWatchedInstrumentIds: mocks.listOwnerWatchedInstrumentIds,
  marketEventSummary: mocks.marketEventSummary,
}));
vi.mock('./auth/require-user', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('./db', () => ({ getDatabase: () => ({ name: 'database fixture' }) }));

import { getMarketCalendar } from './market-calendar';

const summary = {
  today: 1,
  thisWeekResults: 2,
  upcomingCorporateActions: 3,
  watchlistRelated: 4,
};

describe('market calendar server service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: 7 });
    mocks.listOwnerWatchedInstrumentIds.mockResolvedValue([42]);
    mocks.listInstrumentsById.mockResolvedValue([
      { id: 42, symbol: 'TCS', name: 'Tata Consultancy Services' },
    ]);
    mocks.marketEventSummary.mockResolvedValue(summary);
    mocks.listMarketEvents.mockResolvedValue([
      {
        id: 1,
        instrumentId: 42,
        symbol: 'tcs',
        companyName: 'Tata Consultancy Services',
        eventType: 'result',
        eventCategory: 'quarterly_results',
        title: 'TCS quarterly results',
        description: null,
        eventDate: '2026-10-10',
        eventTime: new Date('2026-10-10T04:00:00.000Z'),
        sourceName: 'NSE',
        sourceUrl: 'javascript:alert(1)',
        importance: 'high',
        metadata: {},
      },
    ]);
  });

  it('uses the current IST month and enriches public rows with owner relevance', async () => {
    const response = await getMarketCalendar(
      { watchlistOnly: false },
      new Date('2026-10-02T06:30:00.000Z'),
    );

    expect(mocks.listOwnerWatchedInstrumentIds).toHaveBeenCalledWith(expect.anything(), 7);
    expect(mocks.listMarketEvents).toHaveBeenCalledWith(expect.anything(), {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(response.events[0]).toMatchObject({
      onWatchlist: true,
      sourceUrl: null,
      eventTime: '2026-10-10T04:00:00.000Z',
      description: 'The company is expected to publish a financial result update.',
      metadata: {
        whyThisMatters: 'The release updates the company’s reported financial record.',
      },
    });
    expect(response.summary).toEqual(summary);
  });

  it('passes only the signed-in owner scope when watchlist filtering is enabled', async () => {
    await getMarketCalendar(
      {
        from: '2026-10-01',
        to: '2026-10-31',
        eventType: 'result',
        watchlistOnly: true,
      },
      new Date('2026-10-02T06:30:00.000Z'),
    );

    expect(mocks.listMarketEvents).toHaveBeenCalledWith(expect.anything(), {
      from: '2026-10-01',
      to: '2026-10-31',
      eventType: 'result',
      scope: { instrumentIds: [42], symbols: ['TCS'] },
    });
  });

  it('rejects an unauthenticated request at the authoritative server boundary', async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(getMarketCalendar({ watchlistOnly: false })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    });
    expect(mocks.listMarketEvents).not.toHaveBeenCalled();
  });
});
