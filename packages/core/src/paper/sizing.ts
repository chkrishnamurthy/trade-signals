import type { PaperLimits, PaperSizingSnapshot, TradeIntent } from '@equitywise/shared';
import { PAPER_COSTS, type PaperCosts, paperCharges } from '../paper-journal.js';
import type { PortfolioState } from './state.js';

const bps = (base: number, points: number) => Math.floor((base * points) / 10_000);
const floorDiv = (a: number, b: number) => (b > 0 ? Math.floor(a / b) : 0);
const nonNeg = (n: number) => Math.max(0, n);

/**
 * Shares for one intent (docs/planning/paper-trading-plan.md §10):
 * the risk budget over the per-share risk, then every exposure cap, then
 * free cash with no leverage, then reduced until the reservation — planned
 * notional with the worst allowed slip plus round-trip charges — fits.
 * Zero is a legitimate answer; the snapshot says which cap bound.
 */
export function sizePaperEntry(
  intent: TradeIntent,
  state: PortfolioState,
  limits: PaperLimits,
  costs: PaperCosts = PAPER_COSTS,
): PaperSizingSnapshot {
  const planned = intent.entry.reference;
  const perShareRisk = Math.abs(planned - intent.stop);
  const equity = nonNeg(state.equityPaise);
  const available = nonNeg(state.cashPaise);
  const riskBudget = bps(equity, limits.riskBps);
  const caps = {
    byRisk: floorDiv(riskBudget, perShareRisk),
    byCash: floorDiv(available, planned),
    byPosition: floorDiv(bps(equity, limits.maxPositionExposureBps), planned),
    byStock: floorDiv(
      nonNeg(
        bps(equity, limits.maxStockExposureBps) -
          (state.exposureByInstrument.get(intent.instrumentId) ?? 0),
      ),
      planned,
    ),
    bySector: floorDiv(
      nonNeg(
        bps(equity, limits.maxSectorExposureBps) -
          (intent.sector === null ? 0 : (state.exposureBySector.get(intent.sector) ?? 0)),
      ),
      planned,
    ),
    byPortfolio: floorDiv(
      nonNeg(bps(equity, limits.maxPortfolioExposureBps) - state.totalExposurePaise),
      planned,
    ),
  };
  let bindingCap: PaperSizingSnapshot['bindingCap'] = 'byRisk';
  let shares = caps.byRisk;
  for (const key of ['byCash', 'byPosition', 'byStock', 'bySector', 'byPortfolio'] as const) {
    if (caps[key] < shares) {
      shares = caps[key];
      bindingCap = key;
    }
  }
  const reserveFor = (n: number) =>
    n === 0
      ? 0
      : n * planned +
        Math.ceil((n * planned * intent.entry.maxSlipBps) / 10_000) +
        paperCharges(Math.max(planned, intent.stop), Math.max(planned, intent.stop), n, costs);
  while (shares > 0 && reserveFor(shares) > available) {
    shares -= 1;
    bindingCap = 'charges';
  }
  return {
    equityPaise: equity,
    availableCashPaise: available,
    riskBudgetPaise: riskBudget,
    perShareRiskPaise: perShareRisk,
    plannedEntryPaise: planned,
    caps,
    bindingCap,
    shares,
    reservePaise: reserveFor(shares),
  };
}
