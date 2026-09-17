import { readFile } from 'node:fs/promises';
import {
  coherentSignalBars,
  evaluateVwapSetup,
  PAPER_COSTS,
  VWAP_CONFIG,
  validBar,
  vwapMarketContext,
} from '@equitywise/core';
import {
  getDailyBars,
  getScannerQuote,
  getSignalBars,
  getSignalMinutes,
  insertSignalMinutes,
  invalidateProviderCredential,
  listCorporateActions,
  markPaperEquity,
  observeSignalPrice,
  publishVwapSignal,
  reconcileSignalDeadlines,
  recordSignalScan,
  registerStrategy,
  signalUniverseInstruments,
  withSignalScanLock,
} from '@equitywise/db';
import { MarketDataProviderError, type MarketStatus } from '@equitywise/market-data';
import { type ScannerSnapshot, sessionOpen } from '@equitywise/shared';
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
    observationModel: z.literal('sampled_quotes_5s'),
    strategyRevision: z.literal(1),
  })
  .strict();
async function settings() {
  return settingsSchema.parse(
    parse(await readFile(new URL('../../../../config/vwap-signals.yaml', import.meta.url), 'utf8')),
  );
}
/** One account-level worker feed. Browsers read its persisted snapshots, never fan out upstream. */
export function createSignalJobs(context: WorkerContext, log: Logger) {
  let market: MarketStatus | null = null;
  let evaluatedBoundary = 0;
  const evaluatedSymbols = new Set<string>();
  let retryAt = 0;
  /**
   * Last self-heal per provider. A rejected token is re-minted at most once
   * per ten minutes: enough to recover from an early invalidation (Fyers is
   * single-session) without a genuine outage turning into a login storm, and
   * comfortably above Dhan's two-minute mint throttle.
   */
  const lastCredentialRecovery = new Map<string, number>();
  const upstreamFailure = async (error: unknown) => {
    if (!(error instanceof MarketDataProviderError)) return;
    if (error.failure === 'rate_limit')
      retryAt = Date.now() + Math.max(error.retryAfterMs ?? 60_000, 60_000);
    if (error.failure === 'auth') {
      retryAt = Date.now() + 60_000;
      // The error names the provider whose token was rejected — under a
      // routed provider that is one of several, and only ITS row is expired.
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
  const quoteCycle = async () => {
    if (Date.now() < retryAt) return;
    const config = await settings();
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
        receivedAt - q.timestamp.getTime() > 15_000
      )
        continue;
      await observeSignalPrice(
        context.db,
        instrument.id,
        { at: q.timestamp.getTime(), receivedAt, price: q.ltp },
        q.bid ?? null,
        q.ask ?? null,
      );
    }
    await markPaperEquity(context.db, Date.now());
  };
  const scan = async (warmup = false) => {
    if (Date.now() < retryAt) return;
    const config = await settings();
    const start = Date.now();
    const open = sessionOpen(new Date(start)).getTime();
    const boundary = open + Math.floor((start - open) / 300_000) * 300_000;
    if (boundary !== evaluatedBoundary) {
      evaluatedBoundary = boundary;
      evaluatedSymbols.clear();
    }
    const snapshot: ScannerSnapshot = {
      checkedAt: start,
      phase: 'unknown',
      requested: 0,
      evaluated: 0,
      published: 0,
      benchmarkReady: false,
      reasons: {},
      message: 'Scanner preparing history.',
    };
    const reason = (code: string) => {
      snapshot.reasons[code] = (snapshot.reasons[code] ?? 0) + 1;
    };
    if (!config.enabled) {
      await recordSignalScan(context.db, {
        ...snapshot,
        phase: 'paused',
        message: 'Scanner disabled in versioned configuration.',
      });
      return;
    }
    try {
      const status = await marketStatus();
      snapshot.phase = status.phase;
      if (!warmup && (!status.isOpen || start < open || start >= open + 345 * 60_000)) {
        snapshot.message = 'Market closed to new signals.';
        await recordSignalScan(context.db, snapshot);
        return;
      }
      await withSignalScanLock(context.db, async (db) => {
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
              ? Math.max(historyFrom, Math.min(open, last.timestamp - 300_000))
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
        if (!benchmark) {
          reason('BENCHMARK_UNAVAILABLE');
          return;
        }
        await ingest(benchmark.id, { symbol: 'NIFTY50', kind: 'index' });
        const benchmarkBars = await getSignalBars(db, benchmark.id, historyFrom, start);
        snapshot.benchmarkReady =
          benchmarkBars.length >= 250 &&
          coherentSignalBars(benchmarkBars, start) &&
          benchmarkBars.at(-1)?.timestamp ===
            Math.floor((start - open) / 300_000) * 300_000 + open - 300_000 &&
          benchmarkBars.filter((b) => b.timestamp >= open).every((b) => b.volume > 0) &&
          benchmarkBars.some((b) => b.timestamp === open);
        if (!warmup && !snapshot.benchmarkReady) {
          reason('BENCHMARK_UNAVAILABLE');
          snapshot.message = 'Waiting for complete benchmark history; no new signals.';
          return;
        }
        snapshot.benchmark = snapshot.benchmarkReady
          ? vwapMarketContext(benchmarkBars, start)
          : null;
        const expectedDaily = await getDailyBars(db, {
          instrumentId: benchmark.id,
          from: new Date(open - 60 * 86_400_000),
          to: new Date(open - 1),
          limit: 20,
        });
        const version = await registerStrategy(db, VWAP_CONFIG.name, {
          strategy: VWAP_CONFIG,
          costs: PAPER_COSTS,
          settings: config,
          universe,
        });
        // Four history requests in flight, sharing the provider's account limiter.
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
                const bars = await getSignalBars(db, instrument.id, historyFrom, start);
                const actions = await listCorporateActions(db, instrument.id);
                // Avoid manufacturing a trend across an unadjusted split. Resume after a complete new warm-up.
                const action = actions.find(
                  (a) => new Date(`${a.exDate}T00:00:00+05:30`).getTime() >= historyFrom,
                );
                if (action) {
                  reason('CORPORATE_ACTION_WARMUP');
                  continue;
                }
                const daily = await getDailyBars(db, {
                  instrumentId: instrument.id,
                  from: new Date(open - 60 * 86_400_000),
                  to: new Date(open - 1),
                  limit: 20,
                });
                const sum = daily.reduce(
                  (total, b) => total + BigInt(b.close) * BigInt(b.volume),
                  0n,
                );
                const average =
                  daily.length === 20 &&
                  expectedDaily.length === 20 &&
                  daily.every((b, i) => b.timestamp === expectedDaily[i]?.timestamp)
                    ? Number(sum / 20n)
                    : null;
                const quote = await getScannerQuote(context.db, instrument.id);
                if (!quote?.continuous) {
                  reason('FEED_COVERAGE');
                  continue;
                }
                const now = Date.now();
                const input = {
                  bars,
                  benchmark: benchmarkBars,
                  now,
                  tickSize: instrument.tickSize,
                  quote: { bid: quote.bid, ask: quote.ask, timestamp: quote.observedAt.getTime() },
                  averageDailyTurnoverPaise:
                    average !== null && Number.isSafeInteger(average) ? average : null,
                  marketOpen: status.isOpen,
                };
                snapshot.evaluated++;
                if (bars.at(-1)?.timestamp === boundary - 300_000)
                  evaluatedSymbols.add(item.symbol);
                for (const direction of ['BUY', 'SELL'] as const) {
                  const decision = evaluateVwapSetup(input, direction);
                  if (decision.evidence) {
                    if (
                      await publishVwapSignal(db, {
                        instrumentId: instrument.id,
                        strategyVersionId: version,
                        symbol: item.symbol,
                        companyName: item.name,
                        sector: item.sector,
                        publishedAt: Date.now(),
                        clock: Date.now,
                        evidence: decision.evidence,
                      })
                    )
                      snapshot.published++;
                  } else for (const code of decision.failedConditions) reason(code);
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
                log.warn('signal instrument unavailable', {
                  symbol: item.symbol,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }),
        );
        snapshot.message = warmup
          ? 'History warm-up completed; awaiting a live session.'
          : `Evaluated ${snapshot.evaluated} of ${snapshot.requested} stocks. Five-second sampled quote observations.`;
      });
    } catch (error) {
      reason('PROVIDER_UNAVAILABLE');
      await upstreamFailure(error);
      snapshot.phase = 'unknown';
      snapshot.message = 'Market data unavailable; no new signals published.';
      log.warn('signal scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await recordSignalScan(context.db, snapshot);
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
    reconcile: () => reconcileSignalDeadlines(context.db, Date.now()),
    scan: () => scan(),
    warmup: () => scan(true),
  };
}
