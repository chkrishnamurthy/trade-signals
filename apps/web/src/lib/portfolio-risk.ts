import {
  type DailyCloseInput,
  MIN_RISK_SESSIONS,
  type PortfolioEntry,
  type ShareChange,
  samplePoints,
  summariseRisk,
  valueSeries,
} from '@equitywise/core';
import { ownRecordCoversYear, pastOfHoldings } from './portfolio-past';
import { priceLookup } from './portfolio-returns';
import type { PortfolioHoldingDto, PortfolioRiskDto } from './portfolio-types';

/**
 * The Risk tab's numbers: volatility, deepest fall, beta against Nifty 50, each
 * stock's own figures and share of the ups and downs, and the correlation grid.
 * Describes what happened; never says what to do about it.
 */
export function composeRisk(input: {
  readonly entries: readonly PortfolioEntry[];
  readonly changes: readonly ShareChange[];
  /** Raw daily closes of every stock with entries, reaching back at least a year. */
  readonly closes: ReadonlyMap<number, readonly DailyCloseInput[]>;
  /** Nifty 50 daily closes over the same span. */
  readonly indexCloses: readonly DailyCloseInput[];
  readonly holdings: readonly PortfolioHoldingDto[];
  readonly today: string;
}): PortfolioRiskDto {
  const own = valueSeries({
    entries: input.entries,
    changes: input.changes,
    closes: input.closes,
    to: input.today,
    priceOn: priceLookup(input.closes),
  });
  // A record shorter than a year says little about risk; the shares held now at
  // the last twelve months' prices say more, and are labelled as such.
  const basis = ownRecordCoversYear(own[0]?.date ?? null, input.today) ? 'own' : 'past_prices';
  const past =
    basis === 'own'
      ? null
      : pastOfHoldings({
          holdings: input.holdings,
          changes: input.changes,
          closes: input.closes,
          today: input.today,
        });
  const points = past === null || past.points.length === 0 ? own : past.points;
  const used = points === own ? 'own' : 'past_prices';
  // Today's value of each holding; a holding with no price has no weight.
  const priced = input.holdings.filter((h) => h.valuePaise !== null && h.valuePaise > 0);
  const total = priced.reduce((a, h) => a + (h.valuePaise ?? 0), 0);
  const weights = new Map(priced.map((h) => [h.instrumentId, h.valuePaise ?? 0]));
  const label = new Map(input.holdings.map((h) => [h.instrumentId, h]));

  const risk = summariseRisk({
    points,
    indexCloses: input.indexCloses,
    stockCloses: input.closes,
    changes: input.changes,
    weights,
    today: input.today,
  });

  return {
    basis: used,
    basisFrom: points[0]?.date ?? null,
    sessions: risk.sessions,
    skippedDays: risk.skippedDays,
    minSessions: MIN_RISK_SESSIONS,
    volatility: risk.volatility,
    deepestFall: risk.deepestFall,
    drawdown: samplePoints(risk.drawdown, input.today),
    beta: risk.beta,
    stocks: risk.stocks.map((s) => ({
      symbol: label.get(s.instrumentId)?.symbol ?? '',
      name: label.get(s.instrumentId)?.name ?? '',
      weight: total > 0 ? (weights.get(s.instrumentId) ?? 0) / total : 0,
      sessions: s.sessions,
      volatility: s.volatility,
      deepestFall: s.deepestFall,
      share: s.share,
    })),
    correlation: {
      symbols: risk.correlation.ids.map((id) => label.get(id)?.symbol ?? ''),
      cells: risk.correlation.cells,
    },
  };
}
