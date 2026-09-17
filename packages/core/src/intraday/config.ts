import { ORB_STRATEGY_NAME, ORB_STRATEGY_SHORT_NAME } from '@equitywise/shared';

/**
 * Every threshold of the ORB-VC strategy. Frozen: a change here is a new
 * strategy revision (hard rule 7) and the fixtures must be re-derived by hand.
 * Operational settings (capital, universe name, history depth) live in
 * `config/intraday-orb.yaml`, not here.
 *
 * Minutes are IST minutes-of-day (09:15 = 555). Basis points are of the
 * reference price unless stated.
 */
export const ORB_CONFIG = Object.freeze({
  name: ORB_STRATEGY_NAME,
  shortName: ORB_STRATEGY_SHORT_NAME,
  revision: 1,
  timeframe: '5m',
  barMs: 300_000,
  /** Closed 5m bars required before the decision bar (spans prior sessions). */
  warmupBars: 250,

  /** Opening range = candles opening at 09:15, 09:20, 09:25. */
  openingRangeBars: 3,
  /** Signal candles close from 09:35 … 14:30 inclusive. */
  firstSignalCloseMinute: 575,
  lastSignalCloseMinute: 870,
  /** Simulated square-off on the first covered quote at or after 15:15. */
  squareOffMinute: 915,
  /** A candle published later than this after its close is not tradeable. */
  maxPublicationDelayMs: 30_000,

  /** Opening-range width as bps of its midpoint. */
  minOrBps: 25,
  maxOrBps: 100,
  /** Stop sits this far beyond the far side of the range (bps of that side). */
  stopBufferBps: 5,
  /** Risk distance bounds as bps of the reference price. */
  minRiskBps: 30,
  maxRiskBps: 120,
  target1Multiple: 1,
  target2Multiple: 2,

  volumeLookbackBars: 20,
  minRelativeVolume: 1.5,
  minBodyRatio: 0.5,
  /** Close may sit at most this far beyond the range edge (bps of the edge). */
  maxExtensionBps: 50,

  /** Fill beyond ref by more than this skips the signal (bps of ref). */
  maxSlipBps: 30,
  /** Session-level no-trade thresholds. */
  maxGapBps: 300,
  maxIndexMoveBps: 200,
  minPricePaise: 10_000,
  turnoverSessions: 20,
  minTurnoverPaise: 25_000_000_000,

  /** Shared paper book. */
  riskBps: 100,
  maxTradesPerDay: 5,
  maxOpenTrades: 3,
  dailyLossHaltBps: 200,
  /** Fraction of shares booked at Target 1 (floor; no partial below 2 shares). */
  partialAtTarget1: 0.5,

  /** Observation coverage: a gap wider than this makes an outcome unavailable. */
  coverageGapMs: 15_000,
  maxQuoteAgeMs: 5_000,
});
export type OrbConfig = typeof ORB_CONFIG;

/** Plain parameters for the rules card, in the order the page lists them. */
export function orbRules(config: OrbConfig = ORB_CONFIG, universe = 'NIFTY 50') {
  return {
    strategyName: config.name,
    shortName: config.shortName,
    revision: config.revision,
    timeframe: `${config.timeframe} candles`,
    universe,
    parameters: {
      openingRange: '09:15–09:30',
      signalWindow: '09:35–14:30',
      squareOff: '15:15',
      minOrBps: config.minOrBps,
      maxOrBps: config.maxOrBps,
      stopBufferBps: config.stopBufferBps,
      minRiskBps: config.minRiskBps,
      maxRiskBps: config.maxRiskBps,
      target1Multiple: config.target1Multiple,
      target2Multiple: config.target2Multiple,
      minRelativeVolume: config.minRelativeVolume,
      volumeLookbackBars: config.volumeLookbackBars,
      minBodyRatio: config.minBodyRatio,
      maxExtensionBps: config.maxExtensionBps,
      maxSlipBps: config.maxSlipBps,
      maxGapBps: config.maxGapBps,
      maxIndexMoveBps: config.maxIndexMoveBps,
      minPricePaise: config.minPricePaise,
      minTurnoverPaise: config.minTurnoverPaise,
      riskBps: config.riskBps,
      maxTradesPerDay: config.maxTradesPerDay,
      maxOpenTrades: config.maxOpenTrades,
      dailyLossHaltBps: config.dailyLossHaltBps,
      partialAtTarget1: config.partialAtTarget1,
    },
  };
}
