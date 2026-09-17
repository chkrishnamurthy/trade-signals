import type { IntradayEvidence, IntradayProjection } from '@equitywise/shared';
import { istMinutesOfDay, sessionOpen } from '@equitywise/shared';
import { PAPER_COSTS, type PaperCosts } from '../paper-journal.js';
import type { Bar } from '../types.js';
import { allocateCandidates } from './book.js';
import { ORB_CONFIG, type OrbConfig } from './config.js';
import { evaluateOrb } from './evaluate.js';
import {
  type IntradayObservation,
  initialRisk,
  pendingIntradayProjection,
  realisedNet,
  stepProjection,
} from './lifecycle.js';

/**
 * Day-by-day replay of the ORB-VC strategy from stored candles: the same
 * evaluator, lifecycle and book rules the worker runs, fed 1-minute bars
 * instead of sampled quotes. Pure — the script around it does the I/O.
 *
 * A minute bar becomes four observations in a pessimistic order: open, the
 * adverse extreme, the favourable extreme, close. A bar that touches both the
 * stop and a target therefore stops out ("stop wins", plan §3.7).
 */
export interface ReplayStock {
  symbol: string;
  companyName: string;
  tickSize: number;
  /** Closed 5m bars incl. warm-up sessions, ascending. */
  bars: readonly Bar[];
  /** The session's 1m bars, ascending. */
  minutes: readonly Bar[];
  /** Daily bars ending the previous session. */
  daily: readonly Bar[];
}
export interface ReplayInput {
  sessionOpenMs: number;
  stocks: readonly ReplayStock[];
  indexMoveBps: number | null;
  capitalPaise: number;
  config?: OrbConfig;
  costs?: PaperCosts;
}
export interface ReplaySignal {
  symbol: string;
  companyName: string;
  publishedAt: number;
  evidence: IntradayEvidence;
  projection: IntradayProjection;
  realisedNetPaise: number | null;
  initialRiskPaise: number | null;
}
export interface ReplayResult {
  signals: ReplaySignal[];
  netPaise: number;
  taken: number;
  exclusions: { symbol: string; reason: string }[];
}

function minuteObservations(bar: Bar, direction: 'BUY' | 'SELL'): IntradayObservation[] {
  const adverse = direction === 'BUY' ? bar.low : bar.high;
  const favourable = direction === 'BUY' ? bar.high : bar.low;
  return [bar.open, adverse, favourable, bar.close].map((price, i) => ({
    at: bar.timestamp + (i + 1) * 1_000,
    receivedAt: bar.timestamp + (i + 1) * 1_000,
    price,
    continuous: true,
  }));
}

export function replaySession(input: ReplayInput): ReplayResult {
  const config = input.config ?? ORB_CONFIG;
  const costs = input.costs ?? PAPER_COSTS;
  const open = input.sessionOpenMs;
  const live = new Map<string, ReplaySignal>();
  const exclusions = new Map<string, string>();
  const signalled = new Set<string>();
  const stockBy = new Map(input.stocks.map((s) => [s.symbol, s]));

  const reserved = (except: string) => {
    let sum = 0;
    for (const [symbol, s] of live)
      if (
        symbol !== except &&
        s.projection.taken &&
        s.projection.fill !== null &&
        s.projection.endedAt === null
      )
        sum += s.projection.fill * s.projection.remainingShares;
    return sum;
  };
  const feed = (until: number) => {
    for (const [symbol, s] of live) {
      if (s.projection.endedAt !== null) continue;
      const stock = stockBy.get(symbol);
      if (!stock) continue;
      let p = s.projection;
      for (const bar of stock.minutes) {
        if (bar.timestamp + 60_000 > until || bar.timestamp + 1_000 <= p.cursor) continue;
        for (const obs of minuteObservations(bar, s.evidence.direction)) {
          if (p.endedAt !== null) break;
          const allocation =
            p.status === 'PENDING' && p.taken
              ? {
                  capitalPaise: input.capitalPaise,
                  availablePaise: Math.max(0, input.capitalPaise - reserved(symbol)),
                  riskBps: config.riskBps,
                }
              : null;
          p = stepProjection(s.evidence, p, obs, allocation, config, costs);
        }
        if (p.endedAt !== null) break;
      }
      s.projection = p;
      s.realisedNetPaise = realisedNet(s.evidence, p, costs);
      s.initialRiskPaise = initialRisk(s.evidence, p);
    }
  };
  const bookState = () => {
    const taken = [...live.values()].filter((s) => s.projection.taken);
    return {
      capitalPaise: input.capitalPaise,
      tradesToday: taken.length,
      openTrades: taken.filter((s) => s.projection.fill !== null && s.projection.endedAt === null)
        .length,
      dayNetPaise: taken.reduce((sum, s) => sum + (s.realisedNetPaise ?? 0), 0),
    };
  };

  for (
    let close = open + (config.firstSignalCloseMinute - 555) * 60_000;
    istMinutesOfDay(new Date(close)) <= config.lastSignalCloseMinute;
    close += config.barMs
  ) {
    feed(close);
    const candidates: { stock: ReplayStock; evidence: IntradayEvidence }[] = [];
    for (const stock of input.stocks) {
      const decision = evaluateOrb({
        bars: stock.bars,
        asOf: close,
        tickSize: stock.tickSize,
        alreadySignalled: signalled.has(stock.symbol),
        session: { daily: stock.daily, indexMoveBps: input.indexMoveBps },
        config,
      });
      if (decision.kind === 'SIGNAL') candidates.push({ stock, evidence: decision.evidence });
      else if (
        !exclusions.has(stock.symbol) &&
        [
          'HISTORY_INCOMPLETE',
          'PRICE_TOO_LOW',
          'ILLIQUID',
          'GAP',
          'INDEX_SHOCK',
          'OR_RANGE',
        ].includes(decision.reason)
      )
        exclusions.set(stock.symbol, decision.reason);
    }
    if (candidates.length === 0) continue;
    const allocation = allocateCandidates(
      candidates.map((c) => ({
        symbol: c.stock.symbol,
        relativeVolume: c.evidence.relativeVolume,
      })),
      bookState(),
      config,
    );
    // Insert in the allocation's deterministic order (volume, then symbol), so
    // the fills — and the cash each one sees — never depend on input order.
    for (const [symbol, skip] of allocation) {
      const c = candidates.find((x) => x.stock.symbol === symbol);
      if (!c) continue;
      signalled.add(c.stock.symbol);
      live.set(c.stock.symbol, {
        symbol: c.stock.symbol,
        companyName: c.stock.companyName,
        publishedAt: close,
        evidence: c.evidence,
        projection: pendingIntradayProjection(close, skip),
        realisedNetPaise: null,
        initialRiskPaise: null,
      });
    }
  }
  feed(sessionOpen(new Date(open)).getTime() + 375 * 60_000);
  const signals = [...live.values()].sort(
    (a, b) => a.publishedAt - b.publishedAt || a.symbol.localeCompare(b.symbol),
  );
  return {
    signals,
    netPaise: signals.reduce(
      (sum, s) => sum + (s.projection.taken ? (s.realisedNetPaise ?? 0) : 0),
      0,
    ),
    taken: signals.filter((s) => s.projection.taken).length,
    exclusions: [...exclusions].map(([symbol, reason]) => ({ symbol, reason })),
  };
}
