import type { DerivedHolding } from './derive.js';

export interface HoldingQuote {
  readonly ltpPaise: number;
  readonly previousClosePaise: number | null;
}

export interface ValuedHolding extends DerivedHolding {
  /** Average cost a share, in paise, for display only (cost is never stored per share). */
  readonly avgCostPaise: number;
  readonly valuePaise: number | null;
  readonly gainPaise: number | null;
  /** Fraction, e.g. 0.2146 for +21.46%. */
  readonly gainRatio: number | null;
  readonly dayChangePaise: number | null;
  readonly dayChangeRatio: number | null;
  /** Share of the total value of holdings that have a price; 0..1. */
  readonly weight: number | null;
}

export interface PortfolioSummary {
  readonly holdings: readonly ValuedHolding[];
  readonly valuePaise: number;
  /** Cost of the holdings that have a price (the like-for-like denominator). */
  readonly pricedCostPaise: number;
  readonly costPaise: number;
  readonly gainPaise: number;
  readonly gainRatio: number | null;
  readonly dayChangePaise: number;
  readonly dayChangeRatio: number | null;
  readonly unpriced: number;
}

export function summarisePortfolio(
  holdings: readonly DerivedHolding[],
  quotes: ReadonlyMap<number, HoldingQuote>,
): PortfolioSummary {
  let value = 0;
  let pricedCost = 0;
  let cost = 0;
  let day = 0;
  let prevValue = 0;
  let unpriced = 0;
  for (const h of holdings) {
    cost += h.costPaise;
    const q = quotes.get(h.instrumentId);
    if (q === undefined) {
      unpriced += 1;
      continue;
    }
    value += h.shares * q.ltpPaise;
    pricedCost += h.costPaise;
    if (q.previousClosePaise !== null) {
      day += h.shares * (q.ltpPaise - q.previousClosePaise);
      prevValue += h.shares * q.previousClosePaise;
    }
  }
  const valued: ValuedHolding[] = holdings.map((h) => {
    const q = quotes.get(h.instrumentId);
    const avg = h.shares > 0 ? Math.round(h.costPaise / h.shares) : 0;
    if (q === undefined) {
      return {
        ...h,
        avgCostPaise: avg,
        valuePaise: null,
        gainPaise: null,
        gainRatio: null,
        dayChangePaise: null,
        dayChangeRatio: null,
        weight: null,
      };
    }
    const v = h.shares * q.ltpPaise;
    const dayChange =
      q.previousClosePaise === null ? null : h.shares * (q.ltpPaise - q.previousClosePaise);
    return {
      ...h,
      avgCostPaise: avg,
      valuePaise: v,
      gainPaise: v - h.costPaise,
      gainRatio: h.costPaise > 0 ? (v - h.costPaise) / h.costPaise : null,
      dayChangePaise: dayChange,
      dayChangeRatio:
        q.previousClosePaise === null || q.previousClosePaise === 0
          ? null
          : q.ltpPaise / q.previousClosePaise - 1,
      weight: value > 0 ? v / value : null,
    };
  });
  return {
    holdings: valued,
    valuePaise: value,
    pricedCostPaise: pricedCost,
    costPaise: cost,
    gainPaise: value - pricedCost,
    gainRatio: pricedCost > 0 ? (value - pricedCost) / pricedCost : null,
    dayChangePaise: day,
    dayChangeRatio: prevValue > 0 ? day / prevValue : null,
    unpriced,
  };
}
