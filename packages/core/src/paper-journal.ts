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
