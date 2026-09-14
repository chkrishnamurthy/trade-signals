import type { PaperDto, PaperSizing, SignalEvidence, SignalLevels } from '@equitywise/shared';

/** Research assumptions, verified 2026-09-12 against the published charges list.
 * Rates use integer parts per billion, ceiling to paise per component.
 * This is an estimate; actual broker contract-note rounding is not simulated.
 */
export const PAPER_COSTS = Object.freeze({
  version: 'nse-cash-2026-09-12-v1',
  effectiveDate: '2026-09-12',
  brokeragePpb: 300_000,
  brokerageCapPaise: 2000,
  sellTaxPpb: 250_000,
  exchangePpb: 30_699,
  regulatorPpb: 1000,
  protectionPpb: 1,
  buyStampPpb: 30_000,
  gstBps: 1800,
  slippageBps: 2,
});
export type PaperCosts = typeof PAPER_COSTS;
function safe(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError('Money exceeds supported range');
  return n;
}
const ceil = (value: bigint, denominator: bigint): bigint =>
  (value + denominator - 1n) / denominator;
export function paperCharges(
  buy: number,
  sell: number,
  shares: number,
  costs: PaperCosts = PAPER_COSTS,
): number {
  if (![buy, sell, shares].every(Number.isSafeInteger) || buy <= 0 || sell <= 0 || shares < 0)
    throw new RangeError('Invalid paper inputs');
  const b = BigInt(buy) * BigInt(shares);
  const s = BigInt(sell) * BigInt(shares);
  const total = b + s;
  const levy = (value: bigint, rate: number) => ceil(value * BigInt(rate), 1_000_000_000n);
  const cap = BigInt(costs.brokerageCapPaise);
  const broker = [b, s].reduce((sum, value) => {
    const fee = levy(value, costs.brokeragePpb);
    return sum + (fee < cap ? fee : cap);
  }, 0n);
  const taxable =
    broker +
    levy(total, costs.exchangePpb) +
    levy(total, costs.regulatorPpb) +
    levy(total, costs.protectionPpb);
  return safe(
    taxable +
      ceil(taxable * BigInt(costs.gstBps), 10_000n) +
      levy(s, costs.sellTaxPpb) +
      levy(b, costs.buyStampPpb),
  );
}
export function paperNet(
  direction: 'BUY' | 'SELL',
  fill: number,
  exit: number,
  shares: number,
  costs: PaperCosts = PAPER_COSTS,
): number {
  const gross = BigInt(direction === 'BUY' ? exit - fill : fill - exit) * BigInt(shares);
  return safe(
    gross -
      BigInt(
        paperCharges(
          direction === 'BUY' ? fill : exit,
          direction === 'BUY' ? exit : fill,
          shares,
          costs,
        ),
      ),
  );
}
export function estimatedFill(
  price: number,
  tick: number,
  direction: 'BUY' | 'SELL',
  entering: boolean,
  costs: PaperCosts = PAPER_COSTS,
): number {
  const up = (direction === 'BUY') === entering;
  const slip = safe(ceil(BigInt(price) * BigInt(costs.slippageBps), 10_000n));
  return (up ? Math.ceil((price + slip) / tick) : Math.floor((price - slip) / tick)) * tick;
}
export function sizePaperStudy(
  levels: SignalLevels,
  direction: 'BUY' | 'SELL',
  capitalPaise: number,
  riskBps: number,
  availablePaise = capitalPaise,
  costs: PaperCosts = PAPER_COSTS,
): PaperSizing {
  if (
    ![capitalPaise, riskBps, availablePaise].every(Number.isSafeInteger) ||
    capitalPaise <= 0 ||
    availablePaise < 0 ||
    riskBps < 1 ||
    riskBps > 500 ||
    levels.risk <= 0
  )
    throw new RangeError('Invalid research budget');
  const fill = estimatedFill(levels.trigger, levels.tickSize, direction, true, costs);
  const stop = estimatedFill(levels.invalidation, levels.tickSize, direction, false, costs);
  const budget = safe((BigInt(capitalPaise) * BigInt(riskBps)) / 10_000n);
  const loss = (shares: number) => -paperNet(direction, fill, stop, shares, costs);
  const reserve = (shares: number) =>
    safe(
      BigInt(Math.max(fill, stop)) * BigInt(shares) +
        BigInt(paperCharges(Math.max(fill, stop), Math.max(fill, stop), shares, costs)),
    );
  let lo = 0;
  let hi = Math.min(
    Math.floor(budget / levels.risk),
    Math.floor(availablePaise / Math.max(fill, stop)),
  );
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (loss(mid) <= budget && reserve(mid) <= availablePaise) lo = mid;
    else hi = mid - 1;
  }
  const exit1 = estimatedFill(levels.target1, levels.tickSize, direction, false, costs);
  const exit2 = estimatedFill(levels.target2, levels.tickSize, direction, false, costs);
  return {
    shares: lo,
    capitalRequired: reserve(lo),
    maxLoss: loss(lo),
    charges: paperCharges(
      direction === 'BUY' ? fill : stop,
      direction === 'BUY' ? stop : fill,
      lo,
      costs,
    ),
    target1Net: paperNet(direction, fill, exit1, lo, costs),
    target2Net: paperNet(direction, fill, exit2, lo, costs),
  };
}
/** Filled, resolved studies only. Missing observations never become wins or zeros. */
export function paperPerformance(
  papers: readonly PaperDto[],
  maxDrawdownPaise: number | null = null,
) {
  const closed = papers.filter(
    (p) =>
      p.netPaise !== null && p.projection.fill !== null && p.projection.resolution === 'OBSERVED',
  );
  const wins = closed.filter((p) => (p.netPaise ?? 0) > 0);
  const losses = closed.filter((p) => (p.netPaise ?? 0) < 0);
  const profit = wins.reduce((s, p) => s + (p.netPaise ?? 0), 0);
  const loss = -losses.reduce((s, p) => s + (p.netPaise ?? 0), 0);
  const sampleSize = closed.length;
  return {
    sampleSize,
    winners: wins.length,
    losers: losses.length,
    breakeven: sampleSize - wins.length - losses.length,
    winRate: sampleSize ? (wins.length / sampleSize) * 100 : null,
    averageWin: wins.length ? Math.round(profit / wins.length) : null,
    averageLoss: losses.length ? -Math.round(loss / losses.length) : null,
    expectancyR: sampleSize
      ? closed.reduce((s, p) => s + (p.netPaise ?? 0) / p.initialRisk, 0) / sampleSize
      : null,
    profitFactor: loss > 0 ? profit / loss : null,
    netPaise: profit - loss,
    maxDrawdownPaise,
    openMarksComplete: papers.every(
      (p) => p.projection.fill === null || p.projection.endedAt !== null || p.markNetPaise !== null,
    ),
  };
}
export function paperInitialRisk(evidence: SignalEvidence, shares: number): number {
  return safe(BigInt(evidence.levels.risk) * BigInt(shares));
}
