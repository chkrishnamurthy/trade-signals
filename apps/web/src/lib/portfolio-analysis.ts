import {
  capGroups,
  companySize,
  concentration,
  groupByWeight,
  topContributors,
} from '@equitywise/core';
import {
  attentionFacts,
  MAX_SECTOR_GROUPS,
  OTHER_SECTORS,
  SIZE_LABEL,
  UNCLASSIFIED_SECTOR,
} from './portfolio-facts';
import type { AnalysisHoldingDto, PortfolioAnalysisDto, PortfolioDto } from './portfolio-types';

/** Industry and current index memberships for one instrument. */
export interface HoldingRef {
  readonly industry: string | null;
  readonly indexKeys: readonly string[];
  /** AMFI's Large / Mid / Small Cap category when the stock is on its list. */
  readonly amfiCategory?: 'large' | 'mid' | 'small' | null;
}

/** How many holdings "What moved your gain" draws. */
export const CONTRIBUTOR_ROWS = 8;

/**
 * Turns the portfolio overview plus each stock's sector and index memberships into
 * the analysis page. Pure, so the server stays a thin loader and this is testable.
 */
export function composeAnalysis(
  dto: PortfolioDto,
  reference: ReadonlyMap<number, HoldingRef>,
  /** The period end of the AMFI list on file (YYYY-MM-DD), or null when none is loaded. */
  amfiPeriod: string | null = null,
): PortfolioAnalysisDto {
  const priced = dto.holdings.filter((h) => h.valuePaise !== null && h.valuePaise > 0);
  let indexCount = 0;
  const base = priced.map((h) => {
    const ref = reference.get(h.instrumentId);
    const sized = companySize(ref?.amfiCategory ?? null, ref?.indexKeys ?? []);
    if (sized.source === 'index') indexCount += 1;
    return {
      instrumentId: h.instrumentId,
      symbol: h.symbol,
      name: h.name,
      valuePaise: h.valuePaise ?? 0,
      weight: h.weight ?? 0,
      dayChangeRatio: h.dayChangeRatio,
      gainPaise: h.gainPaise,
      gainRatio: h.gainRatio,
      sector: ref?.industry ?? UNCLASSIFIED_SECTOR,
      size: sized.size,
    };
  });

  const { groups: sectorGroups, folded } = capGroups(
    groupByWeight(base.map((h) => ({ key: h.sector, valuePaise: h.valuePaise }))),
    MAX_SECTOR_GROUPS,
    OTHER_SECTORS,
  );
  const holdings: AnalysisHoldingDto[] = base.map((h) => ({
    ...h,
    sectorGroup: folded.has(h.sector) ? OTHER_SECTORS : h.sector,
  }));
  const sectors = sectorGroups.map((g) => ({ ...g, label: g.key }));
  const sizes = groupByWeight(holdings.map((h) => ({ key: h.size, valuePaise: h.valuePaise }))).map(
    (g) => ({
      ...g,
      label: SIZE_LABEL[g.key as keyof typeof SIZE_LABEL] ?? g.key,
    }),
  );

  const conc = concentration(holdings.map((h) => h.valuePaise));
  const largest = [...holdings].sort((a, b) => b.valuePaise - a.valuePaise)[0];
  const withGain = holdings.filter((h) => h.gainPaise !== null && h.gainPaise !== 0);
  const contributors = topContributors(
    withGain.map((h) => ({ key: h.symbol, gainPaise: h.gainPaise ?? 0 })),
    CONTRIBUTOR_ROWS,
  ).map((c) => ({
    symbol: c.key,
    name: holdings.find((h) => h.symbol === c.key)?.name ?? c.key,
    gainPaise: c.gainPaise,
  }));

  const unpricedHoldings = dto.holdings.filter((h) => h.valuePaise === null);
  return {
    totals: dto.totals,
    holdingCount: dto.holdings.length,
    pricesAsOf: dto.pricesAsOf,
    pricesStale: dto.pricesStale,
    holdings,
    sectors,
    sizes,
    sizeBasis: { amfiPeriod, indexCount },
    concentration:
      conc === null || largest === undefined ? null : { ...conc, largestName: largest.name },
    contributors,
    contributorsTotal: withGain.length,
    unpriced: {
      count: unpricedHoldings.length,
      costPaise: unpricedHoldings.reduce((a, h) => a + h.costPaise, 0),
    },
    attention: attentionFacts({
      holdings,
      sectors,
      upcoming: dto.upcoming,
      unpriced: unpricedHoldings.length,
    }),
    upcoming: dto.upcoming,
  };
}
