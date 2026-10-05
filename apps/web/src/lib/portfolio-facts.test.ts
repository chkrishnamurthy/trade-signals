import { describe, expect, it } from 'vitest';
import { attentionFacts, dividendEstimatePaise } from './portfolio-facts';
import type { AnalysisHoldingDto, UpcomingEventDto } from './portfolio-types';

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
  ...over,
});

describe('attentionFacts', () => {
  const facts = attentionFacts({
    holdings: [
      h('ITC', 0.187, 0.12),
      h('Zen Technologies', 0.098, -0.266),
      h('TCS', 0.085, -0.159),
    ],
    sectors: [
      { key: 'Banks', label: 'Banks', valuePaise: 1, weight: 0.295, count: 2 },
      { key: 'FMCG', label: 'FMCG', valuePaise: 1, weight: 0.187, count: 1 },
    ],
    upcoming: [
      ev({}),
      ev({ name: 'Polycab', eventType: 'stock_split', eventDate: '2026-11-01' }),
      ev({ eventType: 'result', eventDate: '2026-10-20', dividendPaise: null }),
    ],
    unpriced: 1,
  });

  it('states the largest holding, largest sector and holdings below cost', () => {
    expect(facts[0]).toBe('ITC is 18.7% of your value, your largest holding.');
    expect(facts[1]).toBe('Banks is your largest sector at 29.5%, across 2 holdings.');
    expect(facts[2]).toBe(
      '2 of 3 holdings are below your average cost; Zen Technologies is the furthest, 26.6% below.',
    );
  });
  it('estimates a dividend on today’s shares and names splits and results', () => {
    expect(facts[3]).toBe(
      'HDFC Bank goes ex-dividend on 16 Oct: ₹21.00 a share, about ₹2,520 on your 120 shares.',
    );
    expect(facts[4]).toContain('Polycab has a split with ex-date 1 Nov');
    expect(facts[5]).toBe('HDFC Bank: results on 20 Oct.');
    expect(facts[6]).toContain('1 holding has no price yet');
  });
  it('never advises', () => {
    for (const f of facts)
      expect(f).not.toMatch(/\b(should|consider|too much|reduce|rebalance|buy|sell)\b/i);
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
  });
});
