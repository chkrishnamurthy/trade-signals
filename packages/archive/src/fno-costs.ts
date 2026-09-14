/**
 * Research cost model for index-futures round trips. These are DECLARED
 * ASSUMPTIONS for a backtest, not a broker bill, and they are not date-versioned
 * to the traded day — treat net figures as a current-cost scenario. Every fee
 * rounds UP to integer paise. Percentages are of turnover (price × quantity).
 */

export interface FnoCostConfig {
  version: string;
  brokeragePerSideRate: number; // fraction of turnover
  brokeragePerSideCapPaise: number; // absolute cap per side
  sttSellRate: number; // securities transaction tax, sell side only
  exchangeTxnRate: number;
  sebiRate: number;
  stampBuyRate: number;
  gstRate: number; // applied to brokerage + exchange + sebi
}

/** Illustrative BSE index-futures rates. ASSUMPTIONS — verify before trusting. */
export const RESEARCH_FNO_COSTS: FnoCostConfig = {
  version: 'research-fno-index-fut-assumed-v1',
  brokeragePerSideRate: 0.0003,
  brokeragePerSideCapPaise: 2000, // ₹20
  sttSellRate: 0.0002,
  exchangeTxnRate: 0.0000495,
  sebiRate: 0.000001,
  stampBuyRate: 0.00002,
  gstRate: 0.18,
};

export interface CostBreakdown {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  stamp: number;
  gst: number;
  total: number;
}

const up = Math.ceil;

function sideCost(turnoverPaise: number, isBuy: boolean, cfg: FnoCostConfig): CostBreakdown {
  const brokerage = up(
    Math.min(turnoverPaise * cfg.brokeragePerSideRate, cfg.brokeragePerSideCapPaise),
  );
  const stt = isBuy ? 0 : up(turnoverPaise * cfg.sttSellRate);
  const exchange = up(turnoverPaise * cfg.exchangeTxnRate);
  const sebi = up(turnoverPaise * cfg.sebiRate);
  const stamp = isBuy ? up(turnoverPaise * cfg.stampBuyRate) : 0;
  const gst = up((brokerage + exchange + sebi) * cfg.gstRate);
  return {
    brokerage,
    stt,
    exchange,
    sebi,
    stamp,
    gst,
    total: brokerage + stt + exchange + sebi + stamp + gst,
  };
}

/** Total round-trip cost in paise for `qty` units entered and exited. */
export function roundTripCost(
  entryPaise: number,
  exitPaise: number,
  qty: number,
  cfg: FnoCostConfig = RESEARCH_FNO_COSTS,
): CostBreakdown {
  const buy = sideCost(entryPaise * qty, true, cfg);
  const sell = sideCost(exitPaise * qty, false, cfg);
  return {
    brokerage: buy.brokerage + sell.brokerage,
    stt: buy.stt + sell.stt,
    exchange: buy.exchange + sell.exchange,
    sebi: buy.sebi + sell.sebi,
    stamp: buy.stamp + sell.stamp,
    gst: buy.gst + sell.gst,
    total: buy.total + sell.total,
  };
}
