import type { TradeDirection } from './types.js';

/**
 * Round-trip transaction costs for NSE intraday equity.
 *
 * Why this exists: a setup with a 0.18% target and a 0.12% stop looks like a
 * 1.5 reward-to-risk trade and is in fact a losing one, because the round trip
 * costs roughly 0.10% before slippage. Scoring a setup on gross levels is
 * therefore not a rounding error — it inverts the verdict. Every reward-to-risk
 * figure this engine publishes is net of these costs.
 *
 * Rates are percentages of turnover, per the NSE/SEBI schedule for INTRADAY
 * equity (no delivery). They are configuration rather than constants because
 * they change with budgets and with the broker, and a stale hardcoded rate
 * would quietly corrupt every score.
 *
 * Everything here is per-share and in paise. Position size is deliberately
 * absent: the engine does not know the user's capital, and a per-share figure
 * is what a per-share level structure needs to be compared against.
 */
export interface CostModel {
  /** Brokerage per leg, percent of that leg's turnover. */
  readonly brokeragePercentPerLeg: number;
  /** Securities Transaction Tax, percent. Intraday equity: SELL leg only. */
  readonly sttPercentOnSell: number;
  /** Exchange transaction charge, percent, both legs. */
  readonly exchangePercent: number;
  /** SEBI turnover fee, percent, both legs. */
  readonly sebiPercent: number;
  /** Stamp duty, percent. BUY leg only. */
  readonly stampPercentOnBuy: number;
  /** GST, percent, levied on brokerage + exchange + SEBI. */
  readonly gstPercent: number;
  /**
   * Assumed slippage per leg, percent.
   *
   * Not a fee but a real cost, and on a 3-minute trigger the dominant one: the
   * engine's entry is a bar's open, and a marketable order at that moment pays
   * the spread plus whatever moves against it. Counting it as zero is the most
   * common way a backtest lies.
   */
  readonly slippagePercentPerLeg: number;
}

/** Zerodha-tier intraday equity rates, current as of the 2025-26 schedule. */
export const DEFAULT_COST_MODEL: CostModel = {
  brokeragePercentPerLeg: 0.03,
  sttPercentOnSell: 0.025,
  exchangePercent: 0.00297,
  sebiPercent: 0.0001,
  stampPercentOnBuy: 0.003,
  gstPercent: 18,
  slippagePercentPerLeg: 0.02,
};

/** The itemised round-trip cost of one share, in paise. */
export interface CostBreakdown {
  readonly brokerage: number;
  readonly stt: number;
  readonly exchange: number;
  readonly sebi: number;
  readonly stamp: number;
  readonly gst: number;
  readonly slippage: number;
  /** Sum of the above, paise per share. */
  readonly total: number;
}

const pct = (value: number, percent: number): number => (value * percent) / 100;

/**
 * Round-trip cost, in paise, of entering at `entry` and exiting at `exit`.
 *
 * Direction decides which leg is the buy and which the sell, because STT falls
 * on the sell and stamp duty on the buy. For a short the entry IS the sell.
 *
 * Returned unrounded: costs are compared against ATR-scale distances and
 * rounding each component to a whole paisa would bias a ₹200 stock's figures
 * upward by a meaningful fraction.
 */
export function roundTripCost(
  direction: TradeDirection,
  entry: number,
  exit: number,
  model: CostModel,
): CostBreakdown {
  const buy = direction === 'long' ? entry : exit;
  const sell = direction === 'long' ? exit : entry;
  const turnover = buy + sell;

  const brokerage = pct(turnover, model.brokeragePercentPerLeg);
  const stt = pct(sell, model.sttPercentOnSell);
  const exchange = pct(turnover, model.exchangePercent);
  const sebi = pct(turnover, model.sebiPercent);
  const stamp = pct(buy, model.stampPercentOnBuy);
  const gst = pct(brokerage + exchange + sebi, model.gstPercent);
  const slippage = pct(turnover, model.slippagePercentPerLeg);

  return {
    brokerage,
    stt,
    exchange,
    sebi,
    stamp,
    gst,
    slippage,
    total: brokerage + stt + exchange + sebi + stamp + gst + slippage,
  };
}

/**
 * Round-trip cost as a percentage of the entry price.
 *
 * The figure to compare a target distance against: a target closer than this
 * cannot pay for the trade that reaches it.
 */
export function costPercent(
  direction: TradeDirection,
  entry: number,
  exit: number,
  model: CostModel,
): number {
  if (entry <= 0) return 0;
  return (roundTripCost(direction, entry, exit, model).total / entry) * 100;
}

/**
 * Net profit per share, in paise, of a completed round trip.
 *
 * Signed: negative is a loss. A long that exits above its entry can still
 * return a negative number here, which is the entire point of the function.
 */
export function netPnl(
  direction: TradeDirection,
  entry: number,
  exit: number,
  model: CostModel,
): number {
  const gross = direction === 'long' ? exit - entry : entry - exit;
  return gross - roundTripCost(direction, entry, exit, model).total;
}
