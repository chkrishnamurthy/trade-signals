import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PortfolioDto, PortfolioHoldingDto } from '@/lib/portfolio-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/portfolio',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import { PortfolioView, standOut } from './portfolio-view';

function holding(overrides: Partial<PortfolioHoldingDto>): PortfolioHoldingDto {
  return {
    instrumentId: 1,
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    shares: 10,
    costPaise: 2_400_000,
    avgCostPaise: 240_000,
    ltpPaise: 250_000,
    priceSource: 'close',
    priceAsOf: '2026-10-01T10:00:00Z',
    valuePaise: 2_500_000,
    gainPaise: 100_000,
    gainRatio: 100_000 / 2_400_000,
    dayChangePaise: 5_000,
    dayChangeRatio: 0.002,
    weight: 0.625,
    adjustments: [],
    historyGapBefore: null,
    ...overrides,
  };
}

const RELIANCE = holding({});
const ITC = holding({
  instrumentId: 2,
  symbol: 'ITC',
  name: 'ITC',
  shares: 50,
  costPaise: 2_000_000,
  avgCostPaise: 40_000,
  ltpPaise: 30_000,
  valuePaise: 1_500_000,
  gainPaise: -500_000,
  gainRatio: -0.25,
  dayChangePaise: -2_500,
  dayChangeRatio: -0.0017,
  weight: 0.375,
});

function portfolio(holdings: PortfolioHoldingDto[]): PortfolioDto {
  return {
    holdings,
    entries: [],
    entryCount: holdings.length,
    entryLimit: 5_000,
    totals: {
      valuePaise: 4_000_000,
      costPaise: 4_400_000,
      pricedCostPaise: 4_400_000,
      gainPaise: -400_000,
      gainRatio: -400_000 / 4_400_000,
      dayChangePaise: 2_500,
      dayChangeRatio: 0.0006,
      unpriced: 0,
    },
    pricesAsOf: '2026-10-01T10:00:00Z',
    pricesStale: false,
    problems: [],
    upcoming: [],
    returns: null,
    hasRemovals: false,
  };
}

/** What a person can read: the markup with tags and attributes removed. */
function visibleText(dto: PortfolioDto): string {
  // The app shell (mocked away above) is what normally provides the tooltip context.
  const html = renderToStaticMarkup(
    createElement(TooltipProvider, null, createElement(PortfolioView, { portfolio: dto })),
  );
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/**
 * CLAUDE.md "Portfolio vocabulary". `portfolio-vocabulary.test.ts` scans the
 * source; this checks the page a user actually gets, numbers and all.
 */
const BANNED =
  /\b(buy|sell|position|quantity|order(?!s? placed)|execute|rebalance|recommended|underweight|overweight)\b/i;

describe('PortfolioView', () => {
  it('starts an empty portfolio with the two ways to add shares, and no table', () => {
    const text = visibleText(portfolio([]));
    expect(text).toContain('Add shares');
    expect(text).toContain('Upload a file');
    expect(text).not.toContain('Export CSV');
  });

  it('lists each holding by name', () => {
    const text = visibleText(portfolio([RELIANCE, ITC]));
    expect(text).toContain('Reliance Industries');
    expect(text).toContain('ITC');
    expect(text).toContain('Export CSV');
  });

  it('shows money as rupees, never as raw paise', () => {
    const text = visibleText(portfolio([RELIANCE, ITC]));
    // ₹40,00,000 paise is ₹40,000.00 — the raw integer must not reach the page.
    expect(text).not.toContain('4000000');
    expect(text).not.toContain('2500000');
    expect(text).toMatch(/₹\s?40,000/);
  });

  it('says the app never connects to a broker or places anything', () => {
    expect(visibleText(portfolio([RELIANCE]))).toContain('never connects to your broker');
  });

  it('uses none of the order-ticket or advice vocabulary', () => {
    for (const dto of [portfolio([]), portfolio([RELIANCE, ITC])]) {
      // The one sanctioned use is the disclaimer that nothing here places an order.
      const text = visibleText(dto).replace(/nothing here places an order/gi, '');
      expect(text.match(BANNED)?.[0]).toBeUndefined();
    }
  });
});

describe('standOut', () => {
  it('states the largest holding and how many are below average cost', () => {
    const facts = standOut([RELIANCE, ITC]);
    expect(facts[0]).toMatch(
      /^Reliance Industries is .* of your value\. It is your largest holding\.$/,
    );
    expect(facts[1]).toMatch(/^1 of 2 holdings are below your average cost; ITC is .* below\.$/);
  });

  it('says nothing about a single holding with a gain', () => {
    expect(standOut([RELIANCE])).toEqual([]);
  });

  it('explains a share count changed by a split', () => {
    const split = holding({
      adjustments: [{ kind: 'split', exDate: '2026-08-14', ratio: 0.5 }],
    });
    expect(standOut([split]).join(' ')).toContain('share count adjusted for a split');
  });

  it('states facts and never tells the user what to do', () => {
    const facts = standOut([
      RELIANCE,
      ITC,
      holding({ instrumentId: 3, name: 'Old Co', historyGapBefore: '2018-01-31' }),
    ]).join(' ');
    expect(facts).not.toMatch(/\b(should|consider|reduce|trim|exit|book profit|add more)\b/i);
    expect(facts.match(BANNED)?.[0]).toBeUndefined();
  });
});
