import { interpretAnnouncement } from '@equitywise/core';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AnnouncementsPageDto } from '@/lib/disclosure-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/announcements',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

import { AnnouncementsView } from './announcements-view';

const data: AnnouncementsPageDto = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  categories: [],
  latestAt: null,
  status: 'empty',
  watchlistOnly: false,
  hasWatchlists: false,
  nowIso: '2026-09-14T10:00:00Z',
  query: { search: null, symbol: null, range: 'all', highImpactOnly: false, categories: [] },
  disclaimer: 'Official filings for information.',
  coverage: { latestAttempt: null, lastSuccess: null, failed: false, stale: true },
  personalFilters: {
    state: 'all',
    eventStatus: '',
    normalizedCategory: '',
    source: '',
    hasFacts: false,
  },
};
const render = (value: AnnouncementsPageDto) =>
  renderToStaticMarkup(createElement(AnnouncementsView, { data: value, activeCategories: [] }));
describe('announcement presentation', () => {
  it('shows empty and unverified coverage independently', () => {
    const html = render(data);
    expect(html).toContain('No announcements match');
    expect(html).toContain('Ingestion is stale or unverified');
    expect(html).toContain('NSE announcement ingestion is not connected');
  });
  it('shows watchlist empty and failed ingestion states', () => {
    const html = render({
      ...data,
      watchlistOnly: true,
      coverage: { ...data.coverage, failed: true },
    });
    expect(html).toContain('No watchlist announcements');
    expect(html).toContain('Latest ingestion failed');
  });
  it('shows traceable metadata scope and user actions, without a direction badge', () => {
    const headline = 'Order received';
    const html = render({
      ...data,
      total: 1,
      rows: [
        {
          id: 1,
          instrumentId: null,
          symbol: '500000',
          companyName: 'Example',
          source: 'bse',
          externalId: 'filing-1',
          category: null,
          headline,
          detail: null,
          attachmentUrl: 'https://www.bseindia.com/test.pdf',
          announcedAt: '2026-09-14T10:00:00Z',
          ingestedAt: '2026-09-14T10:10:00Z',
          onWatchlist: false,
          watchlistNames: [],
          interpretation: interpretAnnouncement({ headline, category: null, detail: null }),
          interpretationChecksum: 'abc',
          userState: { read: false, saved: false, dismissed: false, issueReported: false },
        },
      ],
    });
    expect(html).toContain('Attachment not analysed');
    expect(html).toContain('Status not established');
    expect(html).toContain('View interpretation');
    expect(html).toContain('Mark read');
    expect(html).toContain('Save');
    expect(html).toContain('2026-09-14');
    expect(html).toContain('Company mapping unavailable');
    expect(html).not.toContain('>BUY<');
    expect(html).not.toContain('>SELL<');
    expect(html).not.toContain('>New<');
  });
});
