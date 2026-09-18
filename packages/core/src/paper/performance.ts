import type { PaperPerformance, PaperPosition } from '@equitywise/shared';
import { PAPER_SAMPLE_EARLY, PAPER_SAMPLE_TOO_FEW } from './config.js';

/** Wilson 95 % interval for a proportion; the honest way to show 6 of 10. */
export function wilson(successes: number, n: number): [number, number] | null {
  if (n === 0) return null;
  const z = 1.959964;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/**
 * Figures for one group of closed paper trades (docs/planning/paper-trading-plan.md §14).
 * Unresolved trades are counted but excluded from every rate; net is after
 * estimated charges. No annualisation, no Sharpe: not enough sessions to mean anything.
 */
export function paperPerformance(
  group: string,
  positions: readonly PaperPosition[],
): PaperPerformance {
  const closed = positions.filter(
    (p) => p.status === 'CLOSED' && p.projection.resolution === 'OBSERVED' && p.openedAt !== null,
  );
  const unresolved = positions.filter(
    (p) =>
      p.status === 'CLOSED' && (p.projection.resolution === 'UNAVAILABLE' || p.openedAt === null),
  );
  const wins = closed.filter((p) => p.netRealisedPaise > 0);
  const losses = closed.filter((p) => p.netRealisedPaise < 0);
  const n = closed.length;
  const sum = (xs: readonly PaperPosition[], f: (p: PaperPosition) => number) =>
    xs.reduce((s, p) => s + f(p), 0);
  const grossWins = sum(wins, (p) => p.netRealisedPaise);
  const grossLosses = -sum(losses, (p) => p.netRealisedPaise);
  const interval = wilson(wins.length, n);
  const withRisk = closed.filter((p) => (p.initialRiskPaise ?? 0) > 0);
  const holding = closed.filter((p) => p.openedAt !== null && p.closedAt !== null);
  return {
    group,
    closedTrades: n,
    unresolvedTrades: unresolved.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: n - wins.length - losses.length,
    winRate: n ? wins.length / n : null,
    winRateLow95: interval ? interval[0] : null,
    winRateHigh95: interval ? interval[1] : null,
    averageWinPaise: wins.length ? Math.round(grossWins / wins.length) : null,
    averageLossPaise: losses.length ? -Math.round(grossLosses / losses.length) : null,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : null,
    expectancyPaise: n ? Math.round(sum(closed, (p) => p.netRealisedPaise) / n) : null,
    expectancyTimesRisked: withRisk.length
      ? sum(withRisk, (p) => p.netRealisedPaise / (p.initialRiskPaise ?? 1)) / withRisk.length
      : null,
    target1HitRate: n ? closed.filter((p) => p.projection.target1At !== null).length / n : null,
    target2HitRate: n
      ? closed.filter((p) => p.projection.status === 'TARGET_2_HIT').length / n
      : null,
    stopHitRate: n ? closed.filter((p) => p.exitReason === 'STOP').length / n : null,
    averageHoldingMs: holding.length
      ? Math.round(sum(holding, (p) => (p.closedAt ?? 0) - (p.openedAt ?? 0)) / holding.length)
      : null,
    grossPaise: sum(closed, (p) => p.grossRealisedPaise),
    chargesPaise: sum(closed, (p) => p.chargesPaise),
    netPaise: sum(closed, (p) => p.netRealisedPaise),
    sampleSize: n < PAPER_SAMPLE_TOO_FEW ? 'TOO_FEW' : n < PAPER_SAMPLE_EARLY ? 'EARLY' : 'OK',
  };
}

/** The same figures for each value of `key` — strategy, version, instrument. */
export function paperPerformanceBy(
  positions: readonly PaperPosition[],
  key: (p: PaperPosition) => string,
): PaperPerformance[] {
  const groups = new Map<string, PaperPosition[]>();
  for (const p of positions) groups.set(key(p), [...(groups.get(key(p)) ?? []), p]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g, ps]) => paperPerformance(g, ps));
}
