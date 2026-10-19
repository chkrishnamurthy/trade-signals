import type { PortfolioEntry } from '@equitywise/core';
import { describe, expect, it } from 'vitest';
import { composeRisk } from './portfolio-risk';
import type { PortfolioHoldingDto } from './portfolio-types';

const holding = (over: Partial<PortfolioHoldingDto>): PortfolioHoldingDto =>
  ({
    instrumentId: 1,
    symbol: 'ITC',
    name: 'ITC',
    valuePaise: 100_000,
    costPaise: 90_000,
    ...over,
  }) as PortfolioHoldingDto;

// Weekdays from 2 Mar 2026: a stock that alternates +1% / −1%.
function closes(count: number, start = 10_000): { date: string; closePaise: number }[] {
  const out: { date: string; closePaise: number }[] = [];
  let price = start;
  for (
    let d = new Date('2026-03-02T00:00:00Z');
    out.length < count;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    if (out.length > 0) price = Math.round(price * (out.length % 2 === 1 ? 1.01 : 0.99));
    out.push({ date: d.toISOString().slice(0, 10), closePaise: price });
  }
  return out;
}

describe('composeRisk', () => {
  const series = closes(131);
  const today = series.at(-1)?.date ?? '';
  const entries: PortfolioEntry[] = [
    {
      id: 1,
      instrumentId: 1,
      kind: 'add',
      tradeDate: '2026-03-02',
      shares: 10,
      amountPaise: 100_000,
    },
  ];
  const risk = composeRisk({
    entries,
    changes: [],
    closes: new Map([
      [1, series],
      [2, series],
    ]),
    indexCloses: series,
    holdings: [
      holding({ instrumentId: 1, symbol: 'ITC', valuePaise: 300_000 }),
      holding({ instrumentId: 2, symbol: 'TCS', name: 'TCS', valuePaise: 100_000 }),
      holding({ instrumentId: 3, symbol: 'NOPRICE', name: 'No price', valuePaise: null }),
    ],
    today,
  });

  it('gives the portfolio figures once there are about six months of sessions', () => {
    expect(risk.sessions).toBe(130);
    expect(risk.volatility.oneYear.status).toBe('ok');
    // The holdings are the index here, so beta and correlation are 1.
    expect(risk.beta.status === 'ok' && risk.beta.value.beta).toBeCloseTo(1, 6);
    expect(risk.drawdown[0]).toEqual({ date: '2026-03-02', drawdown: 0 });
  });

  it('lists priced holdings largest first, with weights and shares that add up', () => {
    expect(risk.stocks.map((s) => [s.symbol, s.weight])).toEqual([
      ['ITC', 0.75],
      ['TCS', 0.25],
    ]);
    // Identical series: each share equals its weight.
    expect(risk.stocks[0]?.share).toBeCloseTo(0.75, 6);
    expect(risk.correlation.symbols).toEqual(['ITC', 'TCS']);
    expect(risk.correlation.cells[0]?.[1]).toBeCloseTo(1, 6);
  });
});

describe('composeRisk on past prices', () => {
  const series = closes(131);
  const today = series.at(-1)?.date ?? '';
  // A record that began a week ago: far too short to speak for itself.
  const entries: PortfolioEntry[] = [
    { id: 1, instrumentId: 1, kind: 'opening', tradeDate: today, shares: 10, amountPaise: 100_000 },
  ];
  const risk = composeRisk({
    entries,
    changes: [],
    closes: new Map([[1, series]]),
    indexCloses: series,
    holdings: [holding({ instrumentId: 1, shares: 10, valuePaise: 100_000 })],
    today,
  });

  it('uses the shares held now at the past twelve months of prices', () => {
    expect(risk.basis).toBe('past_prices');
    expect(risk.basisFrom).toBe('2026-03-02');
    expect(risk.sessions).toBe(130);
    expect(risk.volatility.oneYear.status).toBe('ok');
    expect(risk.deepestFall.status).toBe('ok');
  });

  it('keeps the own record once it covers a year', () => {
    const long = composeRisk({
      entries: [
        {
          id: 1,
          instrumentId: 1,
          kind: 'opening',
          tradeDate: '2026-03-02',
          shares: 10,
          amountPaise: 100_000,
        },
      ],
      changes: [],
      closes: new Map([[1, series]]),
      indexCloses: series,
      holdings: [holding({ instrumentId: 1, shares: 10, valuePaise: 100_000 })],
      today: '2027-03-05',
    });
    expect(long.basis).toBe('own');
  });
});
