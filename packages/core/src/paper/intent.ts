import type { IntradayEvidence, TradeIntent } from '@equitywise/shared';
import { ORB_CONFIG, type OrbConfig } from '../intraday/config.js';

/** The ORB-VC strategy's stable id in the catalogue. */
export const ORB_STRATEGY_ID = 'orb-vc';

/**
 * A published ORB-VC signal as a provider-neutral trade intent. The evidence
 * already carries the levels; this adds the entry rule, validity window and
 * the exit rules the strategy version was published with, so a position keeps
 * managing under them even if the config changes later.
 */
export function intentFromSignal(
  signal: {
    id: number;
    strategyVersionId: number;
    instrumentId: number;
    symbol: string;
    sector: string | null;
    evidence: IntradayEvidence;
  },
  config: OrbConfig = ORB_CONFIG,
): TradeIntent {
  const e = signal.evidence;
  return {
    id: signal.id,
    strategyId: ORB_STRATEGY_ID,
    strategyVersionId: signal.strategyVersionId,
    instrumentId: signal.instrumentId,
    symbol: signal.symbol,
    sector: signal.sector,
    direction: e.direction,
    signalAt: e.signalAt,
    sessionDate: e.sessionDate,
    entry: { kind: 'MARKET_NEXT', reference: e.levels.ref, maxSlipBps: config.maxSlipBps },
    validUntil: e.signalAt + config.barMs,
    stop: e.levels.stop,
    target1: e.levels.target1,
    target2: e.levels.target2,
    riskDistance: e.levels.riskDistance,
    tickSize: e.levels.tickSize,
    exits: {
      partialAtTarget1: config.partialAtTarget1,
      breakevenAfterTarget1: true,
      trailing: null,
      timeExitAt: null,
    },
    sizing: { strength: e.relativeVolume },
    evidence: e,
  };
}
