export type MarketBriefUniverse = 'all' | 'nifty500';

export function parseMarketBriefUniverse(
  requested: string | readonly string[] | undefined,
): MarketBriefUniverse {
  return requested === 'nifty500' ? 'nifty500' : 'all';
}

export function marketBriefHref(universe: MarketBriefUniverse): '/today' | '/today?u=nifty500' {
  return universe === 'nifty500' ? '/today?u=nifty500' : '/today';
}
