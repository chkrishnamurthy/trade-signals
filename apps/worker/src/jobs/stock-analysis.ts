import {
  aggregateBreadth,
  type Bar,
  type BreadthDay,
  barDateKey,
  breadthPoints,
  classifyStoredSeries,
  computeTechnicalMetrics,
  daysBetween,
  daysUntilNext,
  deliveryMetrics,
  fnoMetrics,
  ownershipMetrics,
  parseCorporateActionSubject,
  percentileRanks,
  sizeBucket,
} from '@equitywise/core';
import {
  announcementCountsSince,
  type BreadthUpsert,
  currentIndexKeys,
  dealCountsSince,
  deliveryPointsSince,
  finishSnapshotBuild,
  getDailyBars,
  getDailyBarsForInstruments,
  getInstrumentBySymbol,
  getWorkerCheckpoint,
  insertDailyCandles,
  latestCandleDate,
  latestSignalsOnOrBefore,
  listScreenableInstruments,
  oiPointsSince,
  rawBarsAroundExDate,
  recordCorporateAction,
  recordedCorporateActionKeys,
  resolveInstrumentIds,
  type SnapshotInsert,
  setIndustries,
  setWorkerCheckpoint,
  shareholdingPointsSince,
  startSnapshotBuild,
  syncEquityList,
  syncIndexMembership,
  upcomingEventDates,
  upsertBreadth,
  upsertDeliveryStats,
  upsertScreenerSnapshots,
  upsertShareholding,
} from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';
import { createIndiaDisclosureSource, parseNseBhavdata } from '../sources/india-disclosures.js';
import { createNseMarketSource, INDEX_FILES, type NseMarketSource } from '../sources/nse-market.js';
import { withFeedHealth } from './ingest-disclosures.js';

/**
 * Stock-analysis jobs (docs/planning/screener-dhan-fyers-plan.md §3, §10).
 *
 * Order matters and is encoded in `runStockAnalysisEod`:
 *   reference universe → corporate actions → bhavcopy bars → snapshot + breadth
 *
 * Every job reads and writes the database; the only network calls are to NSE's
 * public end-of-day files through the polite client. Nothing here calls the
 * market-data provider, so these jobs cost no Fyers/Dhan rate budget.
 */

/** Candle source id for bars read from NSE's bhavcopy. */
export const BHAVCOPY_PROVIDER = 'nse-bhavcopy';

/** Bumped whenever a metric formula changes, so a snapshot names the math that made it. */
export const CALC_VERSION = 'screener-v1';

export const STOCK_FEEDS = {
  reference: 'nse-equity-reference',
  corporateActions: 'nse-corporate-actions',
  bars: 'nse-bhavcopy-bars',
  snapshot: 'screener-snapshot',
} as const;

/** Bars each snapshot reads per stock: a 200-EMA plus a year of extremes. */
const LOOKBACK_BARS = 400;
/** Instruments per batched bar read. */
const BAR_BATCH = 150;
/** Sessions of breadth history rebuilt nightly. */
const BREADTH_SESSIONS = 260;

interface JobOptions {
  readonly now?: Date;
  readonly source?: NseMarketSource;
}

// ---------------------------------------------------------------------------
// Reference universe: equity list, index membership, industry
// ---------------------------------------------------------------------------

export async function syncReferenceUniverse(
  context: WorkerContext,
  log: Logger,
  options: JobOptions = {},
): Promise<{ fetched: number; written: number }> {
  const now = options.now ?? new Date();
  const source = options.source ?? createNseMarketSource({ maxRequestsPerRun: 20 });
  const asOf = istDateKey(now);
  return withFeedHealth(context, STOCK_FEEDS.reference, now, async () => {
    const equities = await source.fetchEquityList();
    if (equities.length < 500) {
      // A truncated or error page parses to a handful of rows; syncing it
      // would deactivate the whole universe.
      throw new Error(`equity list looks truncated (${equities.length} rows)`);
    }
    const synced = await syncEquityList(context.db, equities);
    log.info('equity list synced', { listed: equities.length, ...synced });

    const industries = new Map<string, string>();
    for (const { key, file } of INDEX_FILES) {
      try {
        const constituents = await source.fetchIndex(file);
        if (constituents.length === 0) continue;
        const result = await syncIndexMembership(context.db, {
          indexKey: key,
          symbols: constituents.map((c) => c.symbol),
          asOf,
          source: `nse:${file}`,
        });
        for (const c of constituents) if (c.industry !== null) industries.set(c.symbol, c.industry);
        log.info('index synced', {
          index: key,
          members: constituents.length,
          added: result.added,
          removed: result.removed,
          unknown: result.unknown.length,
        });
      } catch (error) {
        log.warn('index sync failed', { index: key, ...errorFields(error) });
      }
    }
    const classified = await setIndustries(context.db, industries, 'nse-index-files');
    log.info('industries set', { classified });
    return { fetched: equities.length, written: synced.instruments };
  });
}

// ---------------------------------------------------------------------------
// Corporate actions → adjustment factors
// ---------------------------------------------------------------------------

/**
 * Records split/bonus/consolidation factors so candles read adjusted.
 *
 * Each action is checked against the RAW stored series first: a series that
 * already reflects it (a provider that returns adjusted history) is left
 * alone, because recording the factor would adjust it twice.
 */
export async function syncCorporateActions(
  context: WorkerContext,
  log: Logger,
  options: JobOptions & { from?: string; to?: string } = {},
): Promise<{ fetched: number; written: number }> {
  const now = options.now ?? new Date();
  const today = istDateKey(now);
  const from = options.from ?? shiftDate(today, -30);
  const to = options.to ?? shiftDate(today, 30);
  const source = options.source ?? createNseMarketSource({ maxRequestsPerRun: 40 });

  return withFeedHealth(context, STOCK_FEEDS.corporateActions, now, async () => {
    const actions = [];
    // The API answers a quarter comfortably; longer windows are walked in steps.
    for (let start = from; start <= to; start = shiftDate(start, 91)) {
      const end = minDate(shiftDate(start, 90), to);
      actions.push(...(await source.fetchCorporateActions(start, end)));
    }
    const recorded = await recordedCorporateActionKeys(context.db, from);
    const ids = await resolveInstrumentIds(
      context.db,
      [...new Set(actions.map((a) => a.symbol))],
    );

    let written = 0;
    const outcomes: Record<string, number> = {};
    const count = (k: string) => {
      outcomes[k] = (outcomes[k] ?? 0) + 1;
    };
    for (const action of actions) {
      const parsed = parseCorporateActionSubject(action.subject);
      if (parsed === null) continue;
      const instrumentId = ids.get(action.symbol);
      if (instrumentId === undefined) {
        count('unknown_symbol');
        continue;
      }
      if (recorded.has(`${instrumentId}|${action.exDate}|${parsed.kind}`)) {
        count('already_recorded');
        continue;
      }
      const around = await rawBarsAroundExDate(context.db, instrumentId, action.exDate);
      const verdict =
        around.lastCloseBefore === null || around.firstOpenOnOrAfter === null
          ? 'raw'
          : classifyStoredSeries(around.lastCloseBefore, around.firstOpenOnOrAfter, Number(parsed.ratio));
      if (verdict !== 'raw') {
        count(verdict);
        log.info('action not applied', { symbol: action.symbol, exDate: action.exDate, verdict });
        continue;
      }
      const inserted = await recordCorporateAction(context.db, {
        instrumentId,
        kind: parsed.kind,
        exDate: action.exDate,
        ratio: parsed.ratio,
        note: `nse: ${action.subject}`.slice(0, 500),
      });
      if (inserted) {
        written += 1;
        count('recorded');
      }
    }
    log.info('corporate actions synced', { from, to, fetched: actions.length, ...outcomes });
    return { fetched: actions.length, written };
  });
}

// ---------------------------------------------------------------------------
// Bhavcopy → daily candles (+ delivery)
// ---------------------------------------------------------------------------

/**
 * One session's bhavcopy into `daily_candles` (and `delivery_stats`).
 * Append-only: a session already stored from any source is left as it was.
 *
 * @returns null when NSE has no file for the date (holiday/weekend).
 */
export async function ingestBhavcopySession(
  context: WorkerContext,
  date: string,
  source: NseMarketSource,
): Promise<{ bars: number; written: number; delivery: number } | null> {
  const file = await source.fetchBhavdata(date);
  if (file === null) return null;
  const ids = await resolveInstrumentIds(
    context.db,
    file.bars.map((b) => b.symbol),
  );
  const candles = file.bars.flatMap((bar) => {
    const instrumentId = ids.get(bar.symbol);
    return instrumentId === undefined
      ? []
      : [
          {
            instrumentId,
            ts: new Date(`${bar.tradingDate}T00:00:00Z`),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          },
        ];
  });
  const written = await insertDailyCandles(context.db, BHAVCOPY_PROVIDER, candles);

  const delivery = parseNseBhavdata(file.csv).flatMap((d) => {
    const instrumentId = ids.get(d.symbol);
    return instrumentId === undefined
      ? []
      : [
          {
            instrumentId,
            tradingDate: d.tradingDate,
            tradedQty: d.tradedQty,
            deliverableQty: d.deliverableQty,
            deliveryPercent: d.deliveryPercent,
            closePaise: d.closePaise,
            prevClosePaise: d.prevClosePaise,
            avgPricePaise: d.avgPricePaise,
            turnoverPaise: d.turnoverPaise,
            trades: d.trades,
            source: d.source,
          },
        ];
  });
  const deliveryWritten = await upsertDeliveryStats(context.db, delivery);
  return { bars: file.bars.length, written, delivery: deliveryWritten };
}

/** Walks bhavcopy files from `from` to `to` (weekdays), resumable through a checkpoint. */
export async function backfillBhavcopy(
  context: WorkerContext,
  log: Logger,
  options: JobOptions & { from: string; to: string; checkpoint?: string },
): Promise<{ sessions: number; written: number }> {
  const checkpoint = options.checkpoint ?? 'bhavcopy-backfill';
  const saved = await getWorkerCheckpoint(context.db, checkpoint);
  const resumeAfter = typeof saved?.lastDate === 'string' ? saved.lastDate : null;
  const source =
    options.source ?? createNseMarketSource({ maxRequestsPerRun: 700, minIntervalMs: 1200 });

  let sessions = 0;
  let written = 0;
  for (let date = options.from; date <= options.to; date = shiftDate(date, 1)) {
    if (resumeAfter !== null && date <= resumeAfter) continue;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    try {
      const result = await ingestBhavcopySession(context, date, source);
      if (result !== null) {
        sessions += 1;
        written += result.written;
      }
      await setWorkerCheckpoint(context.db, checkpoint, { lastDate: date }, Date.now());
    } catch (error) {
      log.warn('bhavcopy backfill stopped', { date, ...errorFields(error) });
      break;
    }
    if (sessions > 0 && sessions % 25 === 0) log.info('bhavcopy backfill progress', { date, sessions, written });
  }
  log.info('bhavcopy backfill finished', { sessions, written });
  return { sessions, written };
}

// ---------------------------------------------------------------------------
// Shareholding sweep (full universe, oldest data first)
// ---------------------------------------------------------------------------

/**
 * Widens quarterly shareholding from watchlisted names to the whole universe,
 * a bounded slice per run: stocks with no or the oldest data go first, so the
 * universe fills in about a week and then stays refreshed. One failed symbol
 * costs only its own batch.
 */
export async function sweepShareholding(
  context: WorkerContext,
  log: Logger,
  options: { perRun?: number; now?: Date } = {},
): Promise<{ fetched: number; written: number }> {
  const perRun = options.perRun ?? 300;
  const universe = await listScreenableInstruments(context.db);
  const latest = new Map<number, string>();
  for (const p of await shareholdingPointsSince(context.db, '1900-01-01')) {
    const have = latest.get(p.instrumentId);
    if (have === undefined || p.asOf > have) latest.set(p.instrumentId, p.asOf);
  }
  const queue = [...universe]
    .sort((a, b) => (latest.get(a.id) ?? '0000').localeCompare(latest.get(b.id) ?? '0000'))
    .slice(0, perRun);

  const disclosure = createIndiaDisclosureSource();
  const idBySymbol = new Map(universe.map((u) => [u.symbol, u.id]));
  let fetched = 0;
  let written = 0;
  for (let i = 0; i < queue.length; i += 20) {
    const symbols = queue.slice(i, i + 20).map((u) => u.symbol);
    try {
      const rows = await disclosure.fetchShareholding({ symbols });
      fetched += rows.length;
      written += await upsertShareholding(
        context.db,
        rows.flatMap((s) => {
          const instrumentId = idBySymbol.get(s.symbol);
          return instrumentId === undefined
            ? []
            : [
                {
                  instrumentId,
                  asOfDate: s.asOf,
                  promoterPercent: s.promoterPercent,
                  fiiPercent: s.fiiPercent,
                  diiPercent: s.diiPercent,
                  publicPercent: s.publicPercent,
                  source: s.source,
                },
              ];
        }),
      );
    } catch (error) {
      log.warn('shareholding batch failed', { first: symbols[0], ...errorFields(error) });
    }
  }
  log.info('shareholding sweep', { symbols: queue.length, fetched, written });
  return { fetched, written };
}

// ---------------------------------------------------------------------------
// Snapshot + breadth
// ---------------------------------------------------------------------------

type MutableBreadth = { -readonly [K in keyof BreadthDay]: BreadthDay[K] };

function mergeBreadth(into: Map<string, MutableBreadth>, days: readonly BreadthDay[]): void {
  for (const d of days) {
    const have = into.get(d.date);
    if (have === undefined) {
      into.set(d.date, { ...d });
      continue;
    }
    have.advances += d.advances;
    have.declines += d.declines;
    have.unchanged += d.unchanged;
    have.above20 += d.above20;
    have.base20 += d.base20;
    have.above50 += d.above50;
    have.base50 += d.base50;
    have.above200 += d.above200;
    have.base200 += d.base200;
    have.newHighs += d.newHighs;
    have.newLows += d.newLows;
    have.base52 += d.base52;
  }
}

/**
 * Builds the screener snapshot for one session and rebuilds breadth history.
 *
 * Only stocks whose newest closed bar IS the session get a row: a stock that
 * did not trade (or whose data is late) is absent rather than shown with a
 * stale price under today's date.
 */
export async function buildScreenerSnapshot(
  context: WorkerContext,
  log: Logger,
  options: { tradingDate?: string; now?: Date } = {},
): Promise<{ tradingDate: string | null; written: number; skipped: number }> {
  const { db } = context;
  const now = options.now ?? new Date();
  const session = options.tradingDate ?? (await latestCandleDate(db, BHAVCOPY_PROVIDER));
  if (session === null) {
    log.warn('no bhavcopy sessions stored yet; nothing to snapshot');
    return { tradingDate: null, written: 0, skipped: 0 };
  }

  const buildId = await startSnapshotBuild(db, session, CALC_VERSION);
  try {
    const result = await withFeedHealth(context, STOCK_FEEDS.snapshot, now, async () => {
      const out = await buildRows(context, log, session, buildId);
      return { fetched: out.instruments, written: out.written };
    });
    await finishSnapshotBuild(db, buildId, {
      status: 'ok',
      instruments: result.fetched,
      rowsWritten: result.written,
      skipped: result.fetched - result.written,
    });
    log.info('snapshot built', { session, rows: result.written, skipped: result.fetched - result.written });
    return { tradingDate: session, written: result.written, skipped: result.fetched - result.written };
  } catch (error) {
    await finishSnapshotBuild(db, buildId, {
      status: 'failed',
      instruments: 0,
      rowsWritten: 0,
      skipped: 0,
      error: String(errorFields(error).errorMessage ?? 'unknown').slice(0, 500),
    });
    throw error;
  }
}

async function buildRows(
  context: WorkerContext,
  log: Logger,
  session: string,
  buildId: number,
): Promise<{ instruments: number; written: number }> {
  const { db } = context;
  const sessionEnd = new Date(`${session}T23:59:59.999Z`);
  const universe = await listScreenableInstruments(db);
  const indexKeys = await currentIndexKeys(db);

  const nifty = await getInstrumentBySymbol(db, 'NIFTY50');
  const benchmark: Bar[] | null =
    nifty === null
      ? null
      : await getDailyBars(db, { instrumentId: nifty.id, from: new Date(0), to: sessionEnd, limit: LOOKBACK_BARS });

  const group = <T extends { instrumentId: number }>(rows: readonly T[]) => {
    const m = new Map<number, T[]>();
    for (const r of rows) {
      const list = m.get(r.instrumentId);
      if (list === undefined) m.set(r.instrumentId, [r]);
      else list.push(r);
    }
    return m;
  };
  const delivery = group(await deliveryPointsSince(db, shiftDate(session, -45)));
  const oi = group(await oiPointsSince(db, shiftDate(session, -45)));
  const holdings = group(await shareholdingPointsSince(db, shiftDate(session, -900)));
  const deals = await dealCountsSince(db, shiftDate(session, -28), session);
  const events = await upcomingEventDates(db, session, shiftDate(session, 30));
  const announcements = await announcementCountsSince(db, new Date(`${shiftDate(session, -7)}T00:00:00Z`));
  const signalRows = await latestSignalsOnOrBefore(db, session);

  const rows: SnapshotInsert[] = [];
  const all = new Map<string, MutableBreadth>();
  const n500 = new Map<string, MutableBreadth>();

  for (let i = 0; i < universe.length; i += BAR_BATCH) {
    const batch = universe.slice(i, i + BAR_BATCH);
    const barsById = await getDailyBarsForInstruments(db, {
      instrumentIds: batch.map((b) => b.id),
      to: sessionEnd,
      limit: LOOKBACK_BARS,
    });
    for (const inst of batch) {
      const bars = barsById.get(inst.id) ?? [];
      const last = bars[bars.length - 1];
      if (last === undefined) continue;
      const keys = indexKeys.get(inst.id) ?? [];

      // Breadth uses every stock with history, current session or not.
      const days = aggregateBreadth([breadthPoints(bars, BREADTH_SESSIONS)]);
      mergeBreadth(all, days);
      if (keys.includes('nifty500')) mergeBreadth(n500, days);

      if (barDateKey(last.timestamp) !== session) continue;
      const tech = computeTechnicalMetrics(bars, benchmark);
      if (tech === null) continue;

      const deliveryPoints = delivery.get(inst.id) ?? [];
      const dm = deliveryMetrics(deliveryPoints, session);
      const today = deliveryPoints.find((p) => p.tradingDate === session);
      const fm = fnoMetrics(oi.get(inst.id) ?? [], session);
      const om = ownershipMetrics(holdings.get(inst.id) ?? []);
      const ev = events.get(inst.id);
      const dealCount = deals.get(inst.id);
      const signal = signalRows.get(inst.id);

      rows.push({
        tradingDate: session,
        instrumentId: inst.id,
        buildId,
        symbol: inst.symbol,
        name: inst.name,
        close: tech.close,
        changePct: tech.changePct,
        gapPct: tech.gapPct,
        ret1w: tech.ret1w,
        ret1m: tech.ret1m,
        ret3m: tech.ret3m,
        ret6m: tech.ret6m,
        ret1y: tech.ret1y,
        retYtd: tech.retYtd,
        dist52wHigh: tech.dist52wHigh,
        dist52wLow: tech.dist52wLow,
        distAth: tech.distAth,
        rangePosDay: tech.rangePosDay,
        high52w: tech.high52w,
        low52w: tech.low52w,
        closeVsEma20: tech.closeVsEma20,
        closeVsEma50: tech.closeVsEma50,
        closeVsEma200: tech.closeVsEma200,
        closeVsSma50: tech.closeVsSma50,
        closeVsSma200: tech.closeVsSma200,
        emaStack: tech.emaStack,
        goldenCrossDays: tech.goldenCrossDays,
        deathCrossDays: tech.deathCrossDays,
        supertrendDir: tech.supertrendDir,
        supertrendFlipDays: tech.supertrendFlipDays,
        adx14: tech.adx14,
        plusDi: tech.plusDi,
        minusDi: tech.minusDi,
        higherHighs: tech.higherHighs,
        ema20: tech.ema20,
        ema50: tech.ema50,
        ema200: tech.ema200,
        supertrendValue: tech.supertrendValue,
        rsi14: tech.rsi14,
        rsiAbove50Days: tech.rsiAbove50Days,
        rsiAbove60Days: tech.rsiAbove60Days,
        rsiBelow40Days: tech.rsiBelow40Days,
        macdHist: tech.macdHist,
        macdHistRising: tech.macdHistRising,
        macdCrossUpDays: tech.macdCrossUpDays,
        macdCrossDownDays: tech.macdCrossDownDays,
        stochK: tech.stochK,
        stochD: tech.stochD,
        roc20: tech.roc20,
        atr14: tech.atr14,
        atrPct: tech.atrPct,
        bbWidth: tech.bbWidth,
        bbSqueeze: tech.bbSqueeze,
        range10Pct: tech.range10Pct,
        range20Pct: tech.range20Pct,
        volatility20: tech.volatility20,
        nr4: tech.nr4,
        nr7: tech.nr7,
        high20d: tech.high20d,
        low20d: tech.low20d,
        breakout20d: tech.breakout20d,
        breakdown20d: tech.breakdown20d,
        breakout52w: tech.breakout52w,
        breakdown52w: tech.breakdown52w,
        insideBar: tech.insideBar,
        outsideBar: tech.outsideBar,
        bullishEngulfing: tech.bullishEngulfing,
        bearishEngulfing: tech.bearishEngulfing,
        hammer: tech.hammer,
        shootingStar: tech.shootingStar,
        doji: tech.doji,
        rsRank: null,
        rs1m: tech.rs1m,
        rs3m: tech.rs3m,
        rs6m: tech.rs6m,
        rsNewHigh: tech.rsNewHigh,
        volume: tech.volume,
        avgVolume20: tech.avgVolume20,
        relVolume: tech.relVolume,
        turnover: today?.turnoverPaise ?? null,
        avgTurnover20: tech.avgTurnover20,
        trades: today?.trades ?? null,
        deliveryPct: dm.deliveryPct,
        avgDelivery20: dm.avgDelivery20,
        deliveryVsAvg: dm.deliveryVsAvg,
        deliveryRatio: dm.deliveryRatio,
        deliveryQty: dm.deliveryQty,
        fnoEligible: fm.fnoEligible,
        futOi: fm.futOi,
        futOiChgPct: fm.futOiChgPct,
        oiBuildup: fm.oiBuildup,
        oiBuildupStreak: fm.oiBuildupStreak,
        oiAsOf: fm.oiAsOf,
        promoterPct: om.promoterPct,
        promoterChgQoq: om.promoterChgQoq,
        publicPct: om.publicPct,
        publicChgQoq: om.publicChgQoq,
        promoterStreak: om.promoterStreak,
        shareholdingAsOf: om.shareholdingAsOf,
        bulkDeals20d: dealCount?.bulk ?? 0,
        blockDeals20d: dealCount?.block ?? 0,
        resultsInDays: ev === undefined ? null : daysUntilNext(ev.results, session),
        exDateInDays: ev === undefined ? null : daysUntilNext(ev.exDates, session),
        announcements7d: announcements.get(inst.id) ?? 0,
        listedDays: inst.listingDate === null ? null : daysBetween(inst.listingDate, session),
        industry: inst.industry,
        series: inst.series,
        indexKeys: keys,
        sizeBucket: sizeBucket(keys),
        signalDirection: signal?.direction ?? null,
        signalStrength: signal?.strength ?? null,
        spark: [...tech.spark],
        dataIssue: tech.dataIssue,
      });
    }
  }

  // Cross-sectional: RS rank needs every stock's 3-month return first.
  const ranks = percentileRanks(rows.map((r) => r.ret3m ?? null));
  rows.forEach((row, i) => {
    row.rsRank = ranks[i] ?? null;
  });

  const written = await upsertScreenerSnapshots(db, rows);
  const breadthRows: BreadthUpsert[] = [
    ...[...all.values()].map((d) => ({ universe: 'all', tradingDate: d.date, ...stripDate(d) })),
    ...[...n500.values()].map((d) => ({ universe: 'nifty500', tradingDate: d.date, ...stripDate(d) })),
  ].filter((r) => r.tradingDate <= session);
  const breadthWritten = await upsertBreadth(db, breadthRows);
  log.info('breadth rebuilt', { rows: breadthWritten });
  return { instruments: universe.length, written };
}

function stripDate(d: MutableBreadth): Omit<BreadthUpsert, 'universe' | 'tradingDate'> {
  const { date: _date, ...rest } = d;
  return rest;
}

// ---------------------------------------------------------------------------
// The evening chain and the first-run backfill
// ---------------------------------------------------------------------------

/**
 * Tonight's bhavcopy → candles → snapshot + breadth. Safe to re-run: candles
 * are append-only and a snapshot rebuild replaces the session's rows.
 */
export async function runStockAnalysisEod(
  context: WorkerContext,
  log: Logger,
  options: { now?: Date; afterBars?: () => Promise<void> } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const session = istDateKey(now);
  const source = createNseMarketSource({ maxRequestsPerRun: 10 });
  const bars = await withFeedHealth(context, STOCK_FEEDS.bars, now, async () => {
    const result = await ingestBhavcopySession(context, session, source);
    return { fetched: result?.bars ?? 0, written: result?.written ?? 0 };
  });
  if (bars.fetched === 0) {
    log.info('no bhavcopy for today (holiday, weekend or not yet published)', { session });
    return;
  }
  log.info('bhavcopy ingested', { session, ...bars });
  if (options.afterBars !== undefined) await options.afterBars();
  await buildScreenerSnapshot(context, log.child('snapshot'), { tradingDate: session, now });
}

export const BACKFILL_CHECKPOINT = 'stock-analysis-backfill';

/** Is the one-time history load done? */
export async function stockAnalysisBackfillDone(context: WorkerContext): Promise<boolean> {
  const cursor = await getWorkerCheckpoint(context.db, BACKFILL_CHECKPOINT);
  return cursor?.done === true;
}

/**
 * First-run load: reference universe, two years of corporate actions and
 * bhavcopy bars, then the latest snapshot. Resumable; marks itself done only
 * when every step finished.
 */
export async function backfillStockAnalysis(
  context: WorkerContext,
  log: Logger,
  options: { now?: Date; years?: number; afterBars?: () => Promise<void> } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const today = istDateKey(now);
  const from = shiftDate(today, -Math.round(365 * (options.years ?? 2)));

  await syncReferenceUniverse(context, log.child('reference'), { now });
  const bars = await backfillBhavcopy(context, log.child('bhavcopy'), { from, to: today, now });
  // Actions after bars: the raw-vs-adjusted check needs the stored series.
  await syncCorporateActions(context, log.child('corporate-actions'), { from, to: shiftDate(today, 30), now });
  if (options.afterBars !== undefined) await options.afterBars();
  const snapshot = await buildScreenerSnapshot(context, log.child('snapshot'), { now });
  if (snapshot.written > 0) {
    await setWorkerCheckpoint(
      context.db,
      BACKFILL_CHECKPOINT,
      { done: true, from, sessions: bars.sessions, snapshot: snapshot.tradingDate },
      Date.now(),
    );
  }
}

// ---------------------------------------------------------------------------
// Date helpers (IST date keys)
// ---------------------------------------------------------------------------

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
