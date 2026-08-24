import {
  buildMarketContext,
  buildVolumeProfile,
  DEFAULT_INTRADAY_CONFIG,
  emptyMarketContext,
  evaluateIntraday,
  type IntradayConfig,
  type IntradayEvaluation,
  type InvalidationRule,
  type LiveSignal,
  minutesToClose,
  type SignalCandidate,
  sessionRegime,
  transition,
} from '@wealthos/core';
import {
  createIntradaySignal,
  expireOpenSignals,
  finishIntradayRun,
  getDailyBars,
  getDailyBarsForInstruments,
  getLiveIntradaySignals,
  getMinuteBars,
  getMinuteBarsForInstruments,
  getRecentlyEndedSetups,
  type IntradayEventInput,
  type IntradayFactorInput,
  type IntradayReasonInput,
  listActiveInstruments,
  registerStrategy,
  type StoredBar,
  type StoredIntradaySignal,
  startIntradayRun,
  updateIntradaySignal,
} from '@wealthos/db';
import type { InstrumentRef } from '@wealthos/market-data';
import { istDateKey, sessionOpen, startOfIstDay } from '@wealthos/shared';
import type { WorkerContext } from '../context.js';
import { loadIntradaySettings } from '../intraday-config.js';
import { errorFields, type Logger } from '../log.js';
import { loadIndexConstituents, type UniverseConstituent } from '../universe.js';
import { ingestIntradayCandles } from './ingest-intraday.js';

/**
 * The intraday evaluation cycle.
 *
 * Runs every few minutes while the market is open and does four things in
 * order: pull the newest closed 1m candles, measure every symbol, decide what
 * changed, and persist it with its evidence.
 *
 * All of the analysis is `@wealthos/core`, which is pure. This file supplies
 * data and stores results and contains no technical judgement of its own —
 * which is what lets the future backtester feed historical bars to the same
 * `evaluateIntraday` and `transition` and get identical answers.
 *
 * Cost discipline. One history call per symbol per cycle; every other
 * timeframe is derived locally. Two caches keep the database out of the hot
 * path for data that cannot change during a session: the intraday volume
 * profile (built from prior sessions) and the previous day's daily bars. Both
 * are keyed by trading date, so they roll over on their own.
 */

const MS_PER_DAY = 86_400_000;

/** Prior daily sessions read per symbol — enough for liquidity and levels. */
const DAILY_LOOKBACK = 40;

/**
 * Minutes after the open before an empty session counts as a fault.
 *
 * Long enough that the first closed candles have certainly been written, short
 * enough that a feed which died overnight is called out on the morning's second
 * cycle rather than at lunchtime.
 */
const EMPTY_SESSION_GRACE_MINUTES = 5;

export interface IntradayCycleResult {
  readonly tradingDate: string;
  readonly regime: string;
  readonly evaluated: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: readonly { readonly symbol: string; readonly reason: string }[];
  readonly ran: boolean;
}

/**
 * Per-session caches.
 *
 * Module-level mutable state, which `packages/core` forbids and an application
 * process does not: the engine stays pure, and the cost of re-reading ten
 * sessions of one-minute candles fifty times every three minutes is paid once
 * per day instead.
 */
interface SessionCache {
  readonly tradingDate: string;
  readonly volumeProfiles: Map<number, readonly number[]>;
  readonly priorMinutes: Map<number, readonly StoredBar[]>;
  readonly dailyBars: Map<number, readonly StoredBar[]>;
}

let cache: SessionCache | null = null;

function cacheFor(tradingDate: string): SessionCache {
  if (cache !== null && cache.tradingDate === tradingDate) return cache;
  cache = {
    tradingDate,
    volumeProfiles: new Map(),
    priorMinutes: new Map(),
    dailyBars: new Map(),
  };
  return cache;
}

export async function runIntradayCycle(
  context: WorkerContext,
  log: Logger,
  options: {
    readonly now?: Date;
    readonly force?: boolean;
    /**
     * Skip the candle fetch and evaluate what is already stored.
     *
     * For replaying a past session: the bars are in the database already, and
     * re-requesting them for every cycle of the day would be thousands of
     * upstream calls for data we have. Never set on the live path — a cycle
     * that does not ingest is evaluating stale bars.
     */
    readonly ingest?: boolean;
  } = {},
): Promise<IntradayCycleResult> {
  const { db } = context;
  const now = options.now ?? new Date();
  const tradingDate = istDateKey(now);

  const settings = await loadIntradaySettings();
  const config = settings.config;
  const regime = sessionRegime(now, config);

  // --- Outside the session -------------------------------------------------
  if ((regime === 'closed' || regime === 'pre_open') && options.force !== true) {
    // Anything still open after the bell is history. Leaving it non-terminal
    // would both show yesterday's setup as a live opportunity and block the
    // same setup from ever forming again.
    const expired =
      regime === 'closed' && minutesToClose(now) === 0
        ? await expireOpenSignals(db, tradingDate, now, 'Session closed')
        : 0;
    if (expired > 0) log.info('expired open signals at the close', { expired, tradingDate });
    return {
      tradingDate,
      regime,
      evaluated: 0,
      created: 0,
      updated: 0,
      skipped: [],
      ran: false,
    };
  }

  const constituents = await loadIndexConstituents(settings.universe.index);
  const contextRefs = buildContextRefs(settings);
  const runId = await startIntradayRun(db, tradingDate, regime, constituents.length);

  try {
    const result = await execute(context, log, {
      now,
      tradingDate,
      regime,
      config,
      constituents,
      contextRefs,
      settings,
      ingest: options.ingest ?? true,
    });

    await finishIntradayRun(db, runId, {
      status: result.skipped.length > constituents.length / 2 ? 'partial' : 'ok',
      symbolsEvaluated: result.evaluated,
      signalsCreated: result.created,
      signalsUpdated: result.updated,
      skipped: result.skipped,
    });
    return result;
  } catch (error) {
    await finishIntradayRun(db, runId, {
      status: 'failed',
      symbolsEvaluated: 0,
      signalsCreated: 0,
      signalsUpdated: 0,
      skipped: [],
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

interface ExecuteInput {
  readonly now: Date;
  readonly tradingDate: string;
  readonly regime: string;
  readonly config: IntradayConfig;
  readonly constituents: readonly UniverseConstituent[];
  readonly contextRefs: readonly InstrumentRef[];
  readonly settings: Awaited<ReturnType<typeof loadIntradaySettings>>;
  readonly ingest: boolean;
}

async function execute(
  context: WorkerContext,
  log: Logger,
  input: ExecuteInput,
): Promise<IntradayCycleResult> {
  const { db } = context;
  const { now, tradingDate, regime, config, constituents, contextRefs, settings, ingest } = input;

  // --- 1. Fresh candles ----------------------------------------------------
  const equityRefs: InstrumentRef[] = constituents.map((c) => ({
    symbol: c.symbol,
    kind: 'equity' as const,
  }));
  if (ingest) {
    const ingested = await ingestIntradayCandles(context, log.child('ingest'), {
      now,
      refs: [...contextRefs, ...equityRefs],
    });
    // A feed that fetched nothing at all is not a quiet market, it is a broken
    // one — almost always an expired credential — and the two are impossible
    // to tell apart from the signals page, which simply shows nothing. Say so
    // here, with the remedy, rather than letting the cycle report "evaluated
    // 50, created 0" and look healthy.
    if (ingested.succeeded === 0 && ingested.requested > 0) {
      log.error('no symbol returned candles; the market-data feed is down', {
        requested: ingested.requested,
        failed: ingested.failed.length,
        remedy:
          'Check the credential — `pnpm fyers:login` mints a new one. Until it is fixed no signals can be produced.',
      });
    }
  }

  // --- 2. Resolve instrument ids ------------------------------------------
  const active = await listActiveInstruments(db);
  const idBySymbol = new Map(active.map((row) => [row.symbol, row.id]));

  const strategyVersionId = await registerStrategy(
    db,
    'intraday',
    config,
    'Intraday engine config from config/intraday.yaml',
  );

  const sessionCache = cacheFor(tradingDate);
  const sessionFrom = sessionOpen(now);
  const profileFrom = new Date(now.getTime() - (config.volume.profileSessions + 8) * MS_PER_DAY);

  // --- 3. Load each symbol's bars -----------------------------------------
  interface Loaded {
    readonly constituent: UniverseConstituent;
    readonly instrumentId: number;
    readonly minute: readonly StoredBar[];
    readonly history: readonly StoredBar[];
    readonly daily: readonly StoredBar[];
    readonly volumeProfile: readonly number[];
    readonly changePercent: number | null;
  }

  const loaded: Loaded[] = [];
  const skipped: { symbol: string; reason: string }[] = [];

  const instrumentIds = constituents
    .map((constituent) => idBySymbol.get(constituent.symbol))
    .filter((id): id is number => id !== undefined);

  // Two batched reads rather than a hundred single ones. Prior-session candles
  // are only fetched on the first cycle of the day — after that the session
  // cache answers — but that first read is fifty symbols × ten sessions, and
  // paying fifty round-trip latencies for it delays the morning's first signals
  // by minutes.
  // How long the continuous session has been running. In the first minutes
  // after the open a symbol legitimately has no CLOSED candle yet, so an empty
  // series only means a broken feed once past that.
  const sessionElapsedMinutes = Math.floor((now.getTime() - sessionFrom.getTime()) / 60_000);

  const readStarted = Date.now();
  await primePriorMinutes(db, sessionCache, instrumentIds, profileFrom, sessionFrom);
  await primeDailyBars(db, sessionCache, instrumentIds, now);
  const todaysBars = await getMinuteBarsForInstruments(db, {
    instrumentIds,
    from: sessionFrom,
    to: now,
    // `raw` on purpose: these are today's own bars, and no corporate action can
    // have an ex-date in their future, so the adjustment factor is always 1.
    raw: true,
  });
  log.debug('bars loaded', { instruments: instrumentIds.length, ms: Date.now() - readStarted });

  for (const constituent of constituents) {
    const instrumentId = idBySymbol.get(constituent.symbol);
    if (instrumentId === undefined) {
      skipped.push({ symbol: constituent.symbol, reason: 'Not a known instrument' });
      continue;
    }

    try {
      // All three come from caches primed by the batched reads above; nothing
      // in this loop touches the network or the database.
      const minute = todaysBars.get(instrumentId) ?? [];
      const daily = sessionCache.dailyBars.get(instrumentId) ?? [];
      const prior = sessionCache.priorMinutes.get(instrumentId) ?? [];
      const volumeProfile = volumeProfileFor(sessionCache, instrumentId, prior, config);

      // No bars for today means there is nothing to measure. Recorded as a
      // skip rather than evaluated against an empty session: the engine would
      // return no candidates either way, but the run row would then claim it
      // evaluated fifty symbols when it saw no prices at all.
      if (minute.length === 0 && sessionElapsedMinutes >= EMPTY_SESSION_GRACE_MINUTES) {
        skipped.push({ symbol: constituent.symbol, reason: 'No candles stored for today' });
        continue;
      }

      const previousClose = daily.at(-1)?.close ?? null;
      const last = minute.at(-1)?.close ?? null;
      loaded.push({
        constituent,
        instrumentId,
        minute,
        history: prior,
        daily,
        volumeProfile,
        changePercent:
          previousClose === null || last === null || previousClose === 0
            ? null
            : ((last - previousClose) / previousClose) * 100,
      });
    } catch (error) {
      skipped.push({ symbol: constituent.symbol, reason: 'Could not read stored bars' });
      log.warn('load failed', { symbol: constituent.symbol, ...errorFields(error) });
    }
  }

  // --- 4. Market context ---------------------------------------------------
  // Computed from what was just loaded rather than fetched again: breadth and
  // sector strength are properties of the same universe being evaluated, and
  // deriving them from a second source would let the two disagree.
  const marketContext = await buildContext(db, idBySymbol, settings, config, now, loaded);
  const sectorMoves = meanBySector(loaded);
  const breadth = advancingShare(loaded);

  // --- 5. Evaluate, transition, persist ------------------------------------
  const liveSignals = await getLiveIntradaySignals(db, tradingDate);
  const liveByInstrument = groupBy(liveSignals, (signal) => signal.instrumentId);

  const cooldownSince = new Date(now.getTime() - config.lifecycle.cooldownMinutes * 60_000);
  const endedSetups = await getRecentlyEndedSetups(db, tradingDate, cooldownSince);
  const endedByInstrument = groupBy(endedSetups, (entry) => entry.instrumentId);

  let evaluated = 0;
  let created = 0;
  let updated = 0;

  for (const entry of loaded) {
    const { constituent, instrumentId } = entry;

    const evaluation = evaluateIntraday(
      {
        symbol: constituent.symbol,
        bars: {
          minute: entry.minute,
          history: entry.history,
          daily: entry.daily,
          volumeProfile: entry.volumeProfile,
        },
        context: {
          ...marketContext,
          sector: constituent.sector,
          sectorChangePercent: sectorMoves.get(constituent.sector) ?? null,
          breadth,
        },
        at: now,
      },
      config,
    );
    evaluated += 1;

    if (evaluation.candidates.length === 0 && evaluation.rejections.length > 0) {
      log.debug('no candidates', {
        symbol: constituent.symbol,
        reasons: evaluation.rejections.slice(0, 3),
      });
    }

    const existing = (liveByInstrument.get(instrumentId) ?? []).map(toLiveSignal);
    const result = transition(
      {
        existing,
        evaluation,
        recentlyEnded: (endedByInstrument.get(instrumentId) ?? []).map((row) => ({
          setupKey: row.setupKey,
          endedAt: row.endedAt.getTime(),
        })),
        at: now,
      },
      config,
    );

    const byId = new Map(
      (liveByInstrument.get(instrumentId) ?? []).map((signal) => [String(signal.id), signal]),
    );
    const eventsByKey = groupBy(result.events, (event) => event.setupKey);

    for (const creation of result.created) {
      const events = (eventsByKey.get(creation.candidate.setupKey) ?? []).map(toEventInput);
      const id = await createIntradaySignal(db, {
        instrumentId,
        strategyVersionId,
        tradingDate,
        setupKey: creation.candidate.setupKey,
        kind: creation.candidate.kind,
        direction: creation.candidate.direction,
        strategy: creation.candidate.strategy,
        state: creation.state,
        regime,
        score: creation.candidate.score,
        quality: creation.candidate.quality,
        scoring: creation.candidate.scoring,
        ...levelColumns(creation.candidate),
        referencePrice: creation.referencePrice,
        triggerMinutes: creation.candidate.triggerMinutes,
        setupMinutes: creation.candidate.setupMinutes,
        trendMinutes: creation.candidate.trendMinutes,
        invalidations: creation.candidate.invalidations,
        indicatorSnapshot: evaluation.snapshot,
        detectedAt: now,
        triggeredAt: creation.triggeredAt === null ? null : new Date(creation.triggeredAt),
        updatedAt: now,
        factors: toFactorInputs(creation.candidate),
        reasons: toReasonInputs(creation.candidate),
        events,
      });
      if (id !== null) {
        created += 1;
        log.info('signal created', {
          symbol: constituent.symbol,
          kind: creation.candidate.kind,
          direction: creation.candidate.direction,
          score: creation.candidate.score,
          state: creation.state,
        });
      }
    }

    for (const change of result.updated) {
      const stored = byId.get(change.id);
      if (stored === undefined) continue;
      const candidate = evaluation.candidates.find((c) => c.setupKey === stored.setupKey) ?? null;
      const events = (eventsByKey.get(stored.setupKey) ?? []).map(toEventInput);

      await updateIntradaySignal(db, {
        id: stored.id,
        state: change.state,
        quality: change.quality,
        score: change.score,
        // Only replaced while the strategy still produces the setup; a signal
        // surviving on its own invalidation conditions keeps the arithmetic it
        // was scored with.
        scoring: candidate?.scoring ?? stored.scoring,
        holds: change.holds,
        maxFavourable: change.maxFavourable,
        maxAdverse: change.maxAdverse,
        triggeredAt: change.triggeredAt === null ? null : new Date(change.triggeredAt),
        referencePrice: change.referencePrice,
        entryLow: change.levels.entryLow,
        entryHigh: change.levels.entryHigh,
        invalidationLevel: change.levels.invalidation,
        target1: change.levels.target1,
        target2: change.levels.target2,
        riskPaise: change.levels.risk,
        rewardPaise: change.levels.reward,
        riskReward: change.levels.riskReward,
        costPaise: Math.round(change.levels.costPaise),
        netRewardPaise: Math.round(change.levels.netReward),
        netRiskPaise: Math.round(change.levels.netRisk),
        netRiskReward: change.levels.netRiskReward,
        updatedAt: now,
        endedAt: change.endedAt === null ? null : new Date(change.endedAt),
        endReason: change.endReason,
        events,
        // Evidence is only rewritten while the strategy still produces it.
        // A signal surviving on its own invalidation conditions must keep the
        // evidence it triggered on, not lose it to an empty list.
        factors: candidate === null ? [] : toFactorInputs(candidate),
        reasons: candidate === null ? [] : toReasonInputs(candidate),
      });
      updated += 1;
    }
  }

  log.info('cycle complete', {
    tradingDate,
    regime,
    evaluated,
    created,
    updated,
    skipped: skipped.length,
  });

  return { tradingDate, regime, evaluated, created, updated, skipped, ran: true };
}

// ---------------------------------------------------------------------------
// Loading helpers
// ---------------------------------------------------------------------------

/**
 * Prior sessions' 1m bars for the whole universe, cached for the trading day.
 *
 * Serves two purposes at once, which is why it is read once and kept: the
 * intraday volume profile is built from it, and the engine prepends part of it
 * to warm indicators whose lookback exceeds a single session. Both are fixed
 * the moment the session opens, which is what makes caching them correct rather
 * than merely cheap — so this is a no-op on every cycle after the first.
 *
 * Adjusted on read, unlike today's bars: a corporate action inside this window
 * genuinely changes what these prices and volumes mean.
 */
async function primePriorMinutes(
  db: WorkerContext['db'],
  sessionCache: SessionCache,
  instrumentIds: readonly number[],
  from: Date,
  sessionStart: Date,
): Promise<void> {
  const missing = instrumentIds.filter((id) => !sessionCache.priorMinutes.has(id));
  if (missing.length === 0) return;

  const bars = await getMinuteBarsForInstruments(db, {
    instrumentIds: missing,
    from,
    to: sessionStart,
  });
  for (const [instrumentId, series] of bars) {
    sessionCache.priorMinutes.set(instrumentId, series);
  }
}

/**
 * Previous sessions' daily bars for the whole universe, cached for the day.
 *
 * Today's session is excluded explicitly. A daily candle for today would be a
 * partial one, and reading its close as "the previous close" would put a price
 * from the current session into a level that is supposed to predate it.
 */
async function primeDailyBars(
  db: WorkerContext['db'],
  sessionCache: SessionCache,
  instrumentIds: readonly number[],
  now: Date,
): Promise<void> {
  const missing = instrumentIds.filter((id) => !sessionCache.dailyBars.has(id));
  if (missing.length === 0) return;

  const bars = await getDailyBarsForInstruments(db, {
    instrumentIds: missing,
    to: startOfIstDay(now),
    limit: DAILY_LOOKBACK,
  });
  const today = istDateKey(now);
  for (const [instrumentId, series] of bars) {
    sessionCache.dailyBars.set(
      instrumentId,
      series.filter((bar) => istDateKey(new Date(bar.timestamp)) !== today),
    );
  }
}

function volumeProfileFor(
  sessionCache: SessionCache,
  instrumentId: number,
  prior: readonly StoredBar[],
  config: IntradayConfig,
): readonly number[] {
  const cached = sessionCache.volumeProfiles.get(instrumentId);
  if (cached !== undefined) return cached;
  const profile = buildVolumeProfile(prior, config);
  sessionCache.volumeProfiles.set(instrumentId, profile);
  return profile;
}

function buildContextRefs(
  settings: Awaited<ReturnType<typeof loadIntradaySettings>>,
): InstrumentRef[] {
  const refs: InstrumentRef[] = [{ symbol: settings.universe.benchmark, kind: 'index' }];
  if (settings.universe.bankingIndex !== null) {
    refs.push({ symbol: settings.universe.bankingIndex, kind: 'index' });
  }
  if (settings.universe.volatilityIndex !== null) {
    refs.push({ symbol: settings.universe.volatilityIndex, kind: 'index' });
  }
  return refs;
}

async function buildContext(
  db: WorkerContext['db'],
  idBySymbol: Map<string, number>,
  settings: Awaited<ReturnType<typeof loadIntradaySettings>>,
  config: IntradayConfig,
  now: Date,
  loaded: readonly { readonly changePercent: number | null }[],
): Promise<ReturnType<typeof emptyMarketContext>> {
  const benchmarkId = idBySymbol.get(settings.universe.benchmark);
  if (benchmarkId === undefined) return emptyMarketContext(settings.universe.benchmark);

  const sessionFrom = sessionOpen(now);
  const [benchmarkMinute, benchmarkDaily] = await Promise.all([
    getMinuteBars(db, { instrumentId: benchmarkId, from: sessionFrom, to: now, raw: true }),
    getDailyBars(db, {
      instrumentId: benchmarkId,
      from: new Date(0),
      to: startOfIstDay(now),
      limit: 5,
    }),
  ]);

  const [banking, volatility] = await Promise.all([
    changePercentFor(db, idBySymbol.get(settings.universe.bankingIndex ?? ''), now),
    levelFor(db, idBySymbol.get(settings.universe.volatilityIndex ?? ''), now),
  ]);

  return buildMarketContext(
    {
      benchmarkSymbol: settings.universe.benchmark,
      benchmarkMinuteBars: benchmarkMinute,
      benchmarkDailyBars: benchmarkDaily,
      bankNiftyChangePercent: banking,
      breadth: advancingShare(loaded),
      sector: null,
      sectorChangePercent: null,
      volatilityIndex: volatility?.level ?? null,
      volatilityPreviousClose: volatility?.previousClose ?? null,
      at: now,
    },
    config,
  );
}

async function changePercentFor(
  db: WorkerContext['db'],
  instrumentId: number | undefined,
  now: Date,
): Promise<number | null> {
  const read = await levelFor(db, instrumentId, now);
  if (read === null || read.previousClose === null || read.previousClose === 0) return null;
  return ((read.level - read.previousClose) / read.previousClose) * 100;
}

async function levelFor(
  db: WorkerContext['db'],
  instrumentId: number | undefined,
  now: Date,
): Promise<{ level: number; previousClose: number | null } | null> {
  if (instrumentId === undefined) return null;
  const [minute, daily] = await Promise.all([
    getMinuteBars(db, { instrumentId, from: sessionOpen(now), to: now, raw: true }),
    getDailyBars(db, {
      instrumentId,
      from: new Date(0),
      to: startOfIstDay(now),
      limit: 2,
    }),
  ]);
  const level = minute.at(-1)?.close;
  if (level === undefined) return null;
  return { level, previousClose: daily.at(-1)?.close ?? null };
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

function advancingShare(
  loaded: readonly { readonly changePercent: number | null }[],
): number | null {
  const withData = loaded.filter((entry) => entry.changePercent !== null);
  if (withData.length === 0) return null;
  const advancing = withData.filter((entry) => (entry.changePercent ?? 0) > 0).length;
  return advancing / withData.length;
}

function meanBySector(
  loaded: readonly {
    readonly constituent: UniverseConstituent;
    readonly changePercent: number | null;
  }[],
): Map<string, number> {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const entry of loaded) {
    if (entry.changePercent === null) continue;
    const bucket = totals.get(entry.constituent.sector) ?? { sum: 0, count: 0 };
    bucket.sum += entry.changePercent;
    bucket.count += 1;
    totals.set(entry.constituent.sector, bucket);
  }
  return new Map([...totals.entries()].map(([sector, { sum, count }]) => [sector, sum / count]));
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const bucket = grouped.get(key(item));
    if (bucket === undefined) grouped.set(key(item), [item]);
    else bucket.push(item);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Mapping between stored rows and engine types
// ---------------------------------------------------------------------------

/**
 * A stored row as the pure lifecycle sees it.
 *
 * The cast on `invalidations` is the one unavoidable widening: jsonb is
 * `unknown` on the way out. It is safe because the same code wrote it in the
 * same shape one cycle earlier, and a malformed rule simply never fires rather
 * than corrupting anything.
 */
function toLiveSignal(row: StoredIntradaySignal): LiveSignal {
  return {
    id: String(row.id),
    symbol: row.symbol,
    setupKey: row.setupKey,
    kind: row.kind as LiveSignal['kind'],
    direction: row.direction === 'short' ? 'short' : 'long',
    state: row.state as LiveSignal['state'],
    score: row.score,
    quality: row.quality as LiveSignal['quality'],
    levels: {
      entryLow: row.entryLow,
      entryHigh: row.entryHigh,
      invalidation: row.invalidationLevel,
      target1: row.target1,
      target2: row.target2,
      risk: row.riskPaise,
      reward: row.rewardPaise,
      riskReward: row.riskReward,
      costPaise: row.costPaise,
      netReward: row.netRewardPaise,
      netRisk: row.netRiskPaise,
      netRiskReward: row.netRiskReward,
    },
    invalidations: Array.isArray(row.invalidations)
      ? (row.invalidations as InvalidationRule[])
      : [],
    createdAt: row.detectedAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    triggeredAt: row.triggeredAt?.getTime() ?? null,
    referencePrice: row.referencePrice,
    holds: row.holds,
    maxFavourable: row.maxFavourable,
    maxAdverse: row.maxAdverse,
    endedAt: row.endedAt?.getTime() ?? null,
    endReason: row.endReason,
  };
}

function levelColumns(candidate: SignalCandidate) {
  return {
    entryLow: candidate.levels.entryLow,
    entryHigh: candidate.levels.entryHigh,
    invalidationLevel: candidate.levels.invalidation,
    target1: candidate.levels.target1,
    target2: candidate.levels.target2,
    riskPaise: candidate.levels.risk,
    rewardPaise: candidate.levels.reward,
    riskReward: candidate.levels.riskReward,
    costPaise: Math.round(candidate.levels.costPaise),
    netRewardPaise: Math.round(candidate.levels.netReward),
    netRiskPaise: Math.round(candidate.levels.netRisk),
    netRiskReward: candidate.levels.netRiskReward,
  };
}

function toFactorInputs(candidate: SignalCandidate): IntradayFactorInput[] {
  return candidate.components.map((component) => ({
    category: component.category,
    label: component.label,
    score: component.score,
    weight: component.weight,
    points: component.points,
    detail: component.detail,
  }));
}

function toReasonInputs(candidate: SignalCandidate): IntradayReasonInput[] {
  return candidate.reasons.map((reason) => ({
    key: reason.key,
    label: reason.label,
    detail: reason.detail,
    category: reason.category,
    polarity: reason.polarity,
  }));
}

function toEventInput(event: {
  at: number;
  kind: string;
  message: string;
  detail: string | null;
  score: number;
  state: string;
}): IntradayEventInput {
  return {
    at: new Date(event.at),
    kind: event.kind,
    message: event.message,
    detail: event.detail,
    score: event.score,
    state: event.state,
  };
}

export type { IntradayEvaluation };
export { DEFAULT_INTRADAY_CONFIG };
