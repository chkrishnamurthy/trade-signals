import { readFile } from 'node:fs/promises';
import {
  evaluateOrb,
  type IntradayObservation,
  ORB_CONFIG,
  PAPER_COSTS,
  validBar,
} from '@equitywise/core';
import {
  getDailyBars,
  getSignalBars,
  getSignalMinutes,
  hasIntradaySignal,
  insertSignalMinutes,
  invalidateProviderCredential,
  listCorporateActions,
  observeIntradayPrice,
  publishIntradaySignal,
  reconcileIntradayDeadlines,
  recordIntradayExclusion,
  recordIntradayScan,
  registerStrategy,
  signalUniverseInstruments,
  withIntradayScanLock,
} from '@equitywise/db';
import { MarketDataProviderError, type MarketStatus } from '@equitywise/market-data';
import {
  type IntradayEvidence,
  type IntradayRejectReason,
  type IntradayScannerSnapshot,
  istDateKey,
  istMinutesOfDay,
  sessionOpen,
} from '@equitywise/shared';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { loadIndexConstituents } from '../universe.js';
import { refreshProviderCredential } from './refresh-credential.js';

const settingsSchema = z
  .object({
    enabled: z.boolean(),
    universe: z.literal('nifty50'),
    historyDays: z.number().int().min(7).max(30),
    historyConcurrency: z.number().int().min(1).max(4),
    strategyRevision: z.literal(ORB_CONFIG.revision),
  })
  .strict();
export type IntradaySettings = z.infer<typeof settingsSchema>;
export async function loadIntradaySettings(): Promise<IntradaySettings> {
  return settingsSchema.parse(
    parse(await readFile(new URL('../../../../config/intraday-orb.yaml', import.meta.url), 'utf8')),
  );
}

/** Day-level reasons worth remembering as "why this stock had no signal today". */
const SESSION_EXCLUSIONS: readonly IntradayRejectReason[] = [
  'HISTORY_INCOMPLETE',
  'PRICE_TOO_LOW',
  'ILLIQUID',
  'GAP',
  'INDEX_SHOCK',
  'OR_RANGE',
];

/**
 * One account-level worker feed for the ORB-VC strategy: history, evaluation
 * and the global level outcomes. Money is per user and lives in `paper.ts`.
 */
export interface IntradayJobOptions {
  /**
   * True while the socket feed is delivering observations. The 5-second quote
   * sweep then stands down and becomes the fallback: it resumes on its own the
   * moment the socket is silent for longer than the coverage window.
   */
  feedHealthy?: () => boolean;
}

export function createIntradayJobs(
  context: WorkerContext,
  log: Logger,
  options: IntradayJobOptions = {},
) {
  let market: MarketStatus | null = null;
  let evaluatedBoundary = 0;
  const evaluatedSymbols = new Set<string>();
  let retryAt = 0;
  const lastCredentialRecovery = new Map<string, number>();
  const upstreamFailure = async (error: unknown) => {
    if (!(error instanceof MarketDataProviderError)) return;
    if (error.failure === 'rate_limit')
      retryAt = Date.now() + Math.max(error.retryAfterMs ?? 60_000, 60_000);
    if (error.failure === 'auth') {
      retryAt = Date.now() + 60_000;
      const providerId = context.providers.has(error.providerId)
        ? error.providerId
        : context.providerId;
      if (Date.now() - (lastCredentialRecovery.get(providerId) ?? 0) >= 600_000) {
        lastCredentialRecovery.set(providerId, Date.now());
        await invalidateProviderCredential(context.db, providerId);
        await refreshProviderCredential(context, log, { providerId });
        market = null;
      }
    }
  };
  const marketStatus = async () => {
    if (!market || Date.now() - market.checkedAt.getTime() > 60_000)
      market = await context.provider.fetchMarketStatus();
    return market;
  };

  /** Sampled quotes every five seconds drive fills, targets, stops and the 15:15 square-off. */
  const quoteCycle = async () => {
    if (Date.now() < retryAt) return;
    if (options.feedHealthy?.()) return;
    const config = await loadIntradaySettings();
    if (!config.enabled) return;
    const now = Date.now();
    const open = sessionOpen(new Date(now)).getTime();
    if (now < open || now >= open + 375 * 60_000) return;
    const status = await marketStatus();
    if (!status.isOpen) return;
    const universe = await loadIndexConstituents(config.universe);
    const instruments = await signalUniverseInstruments(context.db);
    const result = await context.provider.fetchQuotes(universe);
    for (const item of universe) {
      const instrument = instruments.find((i) => i.symbol === item.symbol && i.kind === 'equity');
      const q = result.quotes.get(item.symbol);
      const receivedAt = Date.now();
      if (
        !instrument ||
        !q?.timestamp ||
        q.timestamp.getTime() > receivedAt ||
        receivedAt - q.timestamp.getTime() > ORB_CONFIG.coverageGapMs
      )
        continue;
      const observation: Omit<IntradayObservation, 'continuous'> = {
        at: q.timestamp.getTime(),
        receivedAt,
        price: q.ltp,
      };
      await observeIntradayPrice(
        context.db,
        instrument.id,
        observation,
        q.bid ?? null,
        q.ask ?? null,
      );
    }
  };

  const scan = async (warmup = false) => {
    if (Date.now() < retryAt) return;
    const config = await loadIntradaySettings();
    const start = Date.now();
    const open = sessionOpen(new Date(start)).getTime();
    const tradingDate = istDateKey(new Date(start));
    const boundary = open + Math.floor((start - open) / ORB_CONFIG.barMs) * ORB_CONFIG.barMs;
    if (boundary !== evaluatedBoundary) {
      evaluatedBoundary = boundary;
      evaluatedSymbols.clear();
    }
    const snapshot: IntradayScannerSnapshot = {
      checkedAt: start,
      phase: 'unknown',
      requested: 0,
      evaluated: 0,
      published: 0,
      reasons: {},
      message: 'Scanner preparing history.',
    };
    const reason = (code: string) => {
      snapshot.reasons[code] = (snapshot.reasons[code] ?? 0) + 1;
    };
    if (!config.enabled) {
      await recordIntradayScan(context.db, {
        ...snapshot,
        phase: 'paused',
        message: 'Scanner disabled in versioned configuration.',
      });
      return;
    }
    try {
      const status = await marketStatus();
      snapshot.phase = status.phase;
      const minute = istMinutesOfDay(new Date(boundary));
      const inWindow =
        status.isOpen &&
        minute >= ORB_CONFIG.firstSignalCloseMinute &&
        minute <= ORB_CONFIG.lastSignalCloseMinute;
      if (!warmup && !inWindow) {
        snapshot.message =
          minute < ORB_CONFIG.firstSignalCloseMinute && status.isOpen
            ? 'Opening range forming; signals start at 09:35.'
            : 'Outside the signal window (09:35–14:30).';
        await recordIntradayScan(context.db, snapshot);
        return;
      }
      await withIntradayScanLock(context.db, async (db) => {
        const universe = await loadIndexConstituents(config.universe);
        snapshot.requested = universe.length;
        const instruments = await signalUniverseInstruments(db);
        const benchmark = instruments.find((i) => i.symbol === 'NIFTY50' && i.kind === 'index');
        const historyFrom = open - config.historyDays * 86_400_000;
        const ingest = async (
          instrumentId: number,
          ref: { symbol: string; kind: 'equity' | 'index' },
        ) => {
          const stored = await getSignalMinutes(db, instrumentId, historyFrom, start);
          const last = stored.at(-1);
          const hasGap = stored.some((bar, i) => {
            const previous = stored[i - 1];
            return (
              previous &&
              sessionOpen(new Date(previous.timestamp)).getTime() ===
                sessionOpen(new Date(bar.timestamp)).getTime() &&
              bar.timestamp !== previous.timestamp + 60_000
            );
          });
          const from =
            last && !hasGap
              ? Math.max(historyFrom, Math.min(open, last.timestamp - ORB_CONFIG.barMs))
              : historyFrom;
          const bars = await context.provider.fetchBars({
            ref,
            resolution: '1m',
            range: { from: new Date(from), to: new Date(start) },
            includeForming: false,
            now: new Date(start),
          });
          const closed = bars.filter((b) => b.timestamp + 60_000 <= start);
          if (closed.some((b) => !validBar(b) || b.timestamp % 60_000 !== 0))
            throw new Error('Malformed minute history');
          await insertSignalMinutes(
            db,
            closed.map((b) => ({
              instrumentId,
              providerId: context.providerIdFor('intradayBars'),
              ts: new Date(b.timestamp),
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              volume: b.volume,
            })),
          );
        };
        // NIFTY 50's move at 09:30 versus its previous close: the index-shock gate.
        let indexMoveBps: number | null = null;
        if (benchmark) {
          try {
            await ingest(benchmark.id, { symbol: 'NIFTY50', kind: 'index' });
            const [previous] = await getDailyBars(db, {
              instrumentId: benchmark.id,
              from: new Date(open - 30 * 86_400_000),
              to: new Date(open - 1),
              limit: 1,
            });
            const bars = await getSignalBars(db, benchmark.id, open, start);
            const at930 = bars.find((b) => b.timestamp === open + 2 * ORB_CONFIG.barMs);
            if (previous && at930)
              indexMoveBps = ((at930.close - previous.close) * 10_000) / previous.close;
          } catch (error) {
            log.warn('benchmark history unavailable', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        const version = await registerStrategy(db, ORB_CONFIG.name, {
          strategy: ORB_CONFIG,
          costs: PAPER_COSTS,
          settings: config,
          universe,
        });
        const decisions: {
          instrument: { id: number; tickSize: number };
          item: { symbol: string; name: string };
          evidence: IntradayEvidence;
        }[] = [];
        let next = 0;
        await Promise.all(
          Array.from({ length: config.historyConcurrency }, async () => {
            while (next < universe.length) {
              const item = universe[next++];
              if (!item) break;
              if (!warmup && evaluatedSymbols.has(item.symbol)) {
                snapshot.evaluated++;
                continue;
              }
              const instrument = instruments.find(
                (i) => i.symbol === item.symbol && i.kind === 'equity',
              );
              if (!instrument) {
                reason('INSTRUMENT_UNAVAILABLE');
                continue;
              }
              try {
                await ingest(instrument.id, item);
                if (warmup) continue;
                const actions = await listCorporateActions(db, instrument.id);
                if (
                  actions.some(
                    (a) => new Date(`${a.exDate}T00:00:00+05:30`).getTime() >= historyFrom,
                  )
                ) {
                  reason('CORPORATE_ACTION_WARMUP');
                  continue;
                }
                const bars = await getSignalBars(db, instrument.id, historyFrom, start);
                const daily = await getDailyBars(db, {
                  instrumentId: instrument.id,
                  from: new Date(open - 60 * 86_400_000),
                  to: new Date(open - 1),
                  limit: ORB_CONFIG.turnoverSessions,
                });
                const decision = evaluateOrb({
                  bars,
                  asOf: Date.now(),
                  tickSize: instrument.tickSize,
                  alreadySignalled: await hasIntradaySignal(db, instrument.id, tradingDate),
                  session: { daily, indexMoveBps },
                });
                snapshot.evaluated++;
                if (bars.at(-1)?.timestamp === boundary - ORB_CONFIG.barMs)
                  evaluatedSymbols.add(item.symbol);
                if (decision.kind === 'SIGNAL') {
                  decisions.push({ instrument, item, evidence: decision.evidence });
                } else {
                  reason(decision.reason);
                  if (SESSION_EXCLUSIONS.includes(decision.reason))
                    await recordIntradayExclusion(db, {
                      instrumentId: instrument.id,
                      tradingDate,
                      symbol: item.symbol,
                      reason: decision.reason,
                      detail: decision.checks.find((c) => !c.passed)?.actual,
                      at: Date.now(),
                    });
                }
              } catch (error) {
                reason('HISTORY_UNAVAILABLE');
                if (
                  error instanceof MarketDataProviderError &&
                  (error.failure === 'auth' || error.failure === 'rate_limit')
                ) {
                  next = universe.length;
                  await upstreamFailure(error);
                }
                log.warn('intraday instrument unavailable', {
                  symbol: item.symbol,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }),
        );
        // Every signal is published as a global trade intent; each user's paper
        // portfolio decides for itself whether to take it (plan §6).
        for (const d of decisions) {
          const id = await publishIntradaySignal(db, {
            instrumentId: d.instrument.id,
            strategyVersionId: version,
            symbol: d.item.symbol,
            companyName: d.item.name,
            publishedAt: Date.now(),
            evidence: d.evidence,
            skipReason: null,
          });
          if (id !== null) snapshot.published++;
          else reason('PUBLICATION_MISSED');
        }
        snapshot.message = warmup
          ? 'History warm-up completed; awaiting a live session.'
          : `Evaluated ${snapshot.evaluated} of ${snapshot.requested} stocks; ${snapshot.published} published.`;
      });
    } catch (error) {
      reason('PROVIDER_UNAVAILABLE');
      await upstreamFailure(error);
      snapshot.phase = 'unknown';
      snapshot.message = 'Market data unavailable; no new signals published.';
      log.warn('intraday scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await recordIntradayScan(context.db, snapshot);
  };
  return {
    quoteCycle: async () => {
      try {
        await quoteCycle();
      } catch (error) {
        await upstreamFailure(error);
        throw error;
      }
    },
    reconcile: () => reconcileIntradayDeadlines(context.db, Date.now()),
    scan: () => scan(),
    warmup: () => scan(true),
  };
}
