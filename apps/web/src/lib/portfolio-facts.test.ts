import { describe, expect, it } from 'vitest';
import { attentionFacts, dividendEstimatePaise, UNCLASSIFIED_SECTOR } from './portfolio-facts';
import type { AnalysisHoldingDto, UpcomingEventDto, WeightGroupDto } from './portfolio-types';

const h = (name: string, weight: number, gainRatio: number): AnalysisHoldingDto => ({
  instrumentId: 1,
  symbol: name.toUpperCase(),
  name,
  valuePaise: 1,
  weight,
  dayChangeRatio: null,
  gainPaise: null,
  gainRatio,
  sector: 'Banks',
  sectorGroup: 'Banks',
  size: 'large',
});
const ev = (over: Partial<UpcomingEventDto>): UpcomingEventDto => ({
  symbol: 'HDFCBANK',
  name: 'HDFC Bank',
  eventType: 'dividend',
  eventDate: '2026-10-16',
  title: 'Dividend',
  dividendPaise: 2100,
  shares: 120,
  shareChangeBefore: null,
  ...over,
});
const g = (key: string, weight: number, count = 1): WeightGroupDto => ({
  key,
  label: key,
  valuePaise: 1,
  weight,
  count,
});

const holdings = [
  h('ITC', 0.187, 0.12),
  h('Zen Technologies', 0.098, -0.266),
  h('TCS', 0.085, -0.159),
];

describe('attentionFacts', () => {
  const facts = attentionFacts({
    holdings,
    sectors: [g('Banks', 0.295, 2), g('FMCG', 0.187)],
    upcoming: [
      ev({}),
      ev({ name: 'Polycab', eventType: 'stock_split', eventDate: '2026-11-01' }),
      ev({ eventType: 'result', eventDate: '2026-10-20', dividendPaise: null }),
    ],
    unpriced: 1,
  });

  it('puts what is left out first, then concentration, then events', () => {
    expect(facts).toEqual([
      '1 holding has no price yet and is left out of these figures.',
      'ITC is 18.7% of your value, your largest holding.',
      'Banks is your largest sector at 29.5%, across 2 holdings.',
      '2 of 3 holdings are below your average cost; Zen Technologies is the furthest, 26.6% below.',
      'HDFC Bank goes ex-dividend on 16 Oct: ₹21.00 a share, about ₹2,520 on your 120 shares.',
      'Polycab has a split with ex-date 1 Nov. Your share count is adjusted for you once it is on record.',
      'HDFC Bank: results on 20 Oct.',
    ]);
  });

  it('never advises', () => {
    for (const f of facts)
      expect(f).not.toMatch(/\b(should|consider|too much|reduce|rebalance|buy|sell)\b/i);
  });

  it('does not call a classified sector the largest when unclassified stocks hold more', () => {
    const out = attentionFacts({
      holdings,
      sectors: [g(UNCLASSIFIED_SECTOR, 0.6, 3), g('Banks', 0.4, 2)],
      upcoming: [],
      unpriced: 0,
    });
    expect(out).toContain(
      '60.0% of your value is in stocks NSE has not classified by sector; the largest classified sector is Banks at 40.0%.',
    );
    expect(out.join(' ')).not.toContain('Banks is your largest sector');
  });

  it('names at most three events and points to the rest', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      ev({ eventType: 'result', eventDate: `2026-10-1${i}`, dividendPaise: null }),
    );
    const out = attentionFacts({ holdings, sectors: [], upcoming: many, unpriced: 0 });
    expect(out.filter((f) => f.includes('results on'))).toHaveLength(3);
    expect(out.at(-1)).toBe('2 more events are in Upcoming company events.');
  });

  it('gives no dividend total when a bonus or split comes first', () => {
    const out = attentionFacts({
      holdings,
      sectors: [],
      upcoming: [ev({ shareChangeBefore: { kind: 'bonus', date: '2026-10-10' } })],
      unpriced: 0,
    });
    expect(out).toContain(
      'HDFC Bank goes ex-dividend on 16 Oct: ₹21.00 a share. Your share count changes with the bonus on 10 Oct first, so no total is estimated.',
    );
  });

  it('says nothing about concentration for a single holding', () => {
    expect(
      attentionFacts({ holdings: [h('ITC', 1, 0.1)], sectors: [], upcoming: [], unpriced: 0 }),
    ).toEqual([]);
  });
});

describe('dividendEstimatePaise', () => {
  it('multiplies the per-share amount by shares held, or gives null', () => {
    expect(dividendEstimatePaise(ev({}))).toBe(252000);
    expect(dividendEstimatePaise(ev({ dividendPaise: null }))).toBeNull();
    expect(
      dividendEstimatePaise(ev({ shareChangeBefore: { kind: 'split', date: '2026-10-01' } })),
    ).toBeNull();
  });
});
