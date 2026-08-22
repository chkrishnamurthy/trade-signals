import 'server-only';
import {
  bucketBars,
  DEFAULT_INTRADAY_CONFIG,
  ema,
  REGIME_LABEL,
  sessionRegime,
  vwap,
} from '@signal/core';
import {
  getIntradayEventsFor,
  getIntradayFactorsFor,
  getIntradayReasonsFor,
  getIntradaySignalDetail,
  getIntradaySignals,
  getIntradaySummary,
  getMinuteBars,
  latestIntradayRun,
  latestIntradaySignalDate,
  resolveInstrumentIds,
  type StoredIntradaySignal,
} from '@signal/db';
import { isRegularSession, istDateKey } from '@signal/shared';
import { z } from 'zod';
import type {
  IntradayEventDto,
  IntradayFactorDto,
  IntradayFeedDto,
  IntradayReasonDto,
  IntradaySignalDto,
  IntradaySignalKind,
  IntradaySignalState,
  InvalidationDto,
  ScoreCategory,
  SignalIndicatorsDto,
  SignalQuality,
  TradeDirection,
} from '@/lib/intraday-types';
import { getDatabase, isDatabaseConfigured } from './db';
import { MarketDataError } from './errors';
import { getIndex } from './indices';
import { getMarketStatus } from './market-status';

/**
 * The intraday signals feed.
 *
 * Reads only. Signals are produced by `apps/worker`, which owns the engine and
 * the rate-limited market-data calls; this layer never computes a signal, never
 * re-derives a score, and never touches the provider except for session state.
 *
 * That separation is what hard rule 8 asks for in practice: the "why?" comes
 * out of `intraday_signal_factors` and `intraday_signal_reasons` exactly as the
 * engine wrote them. A recomputation here could disagree with the stored
 * verdict, which would mean showing an explanation for a signal that was never
 * produced.
 */

/**
 * A pass older than this and the feed is not current.
 *
 * Four times the default three-minute cycle: one missed cycle is a blip, two
 * consecutive misses mean the worker is not running and the user must be told
 * rather than shown stale setups as live opportunities.
 */
const STALE_AFTER_MS = 12 * 60_000;

const OPEN_REFRESH_SECONDS = 30;
const CLOSED_REFRESH_SECONDS = 300;

/** Cache window. Short: the worker writes every few minutes and the page polls. */
const CACHE_TTL_MS = 10_000;

let cache: { feed: IntradayFeedDto; expiresAt: number } | null = null;
let inFlight: Promise<IntradayFeedDto> | null = null;

/**
 * The stored indicator snapshot, parsed at the boundary.
 *
 * Zod rather than a cast: this is JSON that a previous version of the engine
 * may have written, and a field that has since changed shape must degrade to
 * `null` rather than reaching a component as `undefined` and rendering as
 * "NaN%".
 */
const nullableNumber = z.number().nullable().catch(null);

const snapshotSchema = z
  .object({
    price: z.number().catch(0),
    changePercent: nullableNumber,
    vwap: nullableNumber,
    vwapDistancePercent: nullableNumber,
    vwapSlopePercent: nullableNumber,
    rsi: nullableNumber,
    adx: nullableNumber,
    atr: nullableNumber,
    atrPercent: nullableNumber,
    macdHistogram: nullableNumber,
    relativeVolume: nullableNumber,
    barRelativeVolume: nullableNumber,
    sessionVolume: nullableNumber,
    ema9: nullableNumber,
    ema20: nullableNumber,
    ema50: nullableNumber,
    dayHigh: nullableNumber,
    dayLow: nullableNumber,
    dayOpen: nullableNumber,
    previousClose: nullableNumber,
    previousHigh: nullableNumber,
    previousLow: nullableNumber,
    openingRangeHigh: nullableNumber,
    openingRangeLow: nullableNumber,
    gapPercent: nullableNumber,
    trends: z
      .array(
        z.object({
          minutes: z.number(),
          direction: z.enum(['long', 'short', 'flat']).catch('flat'),
          strength: z.number().catch(0),
          detail: z.string().catch(''),
        }),
      )
      .catch([]),
    levels: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          price: z.number(),
          significance: z.number().catch(0),
          kind: z.enum(['support', 'resistance', 'pivot']).catch('pivot'),
        }),
      )
      .catch([]),
  })
  .partial()
  .catch({});

const scoringSchema = z
  .object({
    categoryPoints: z.number(),
    maxPoints: z.number(),
    conviction: z.number(),
    regimePenalty: z.number(),
    score: z.number(),
  })
  .nullable()
  .catch(null);

const invalidationSchema = z
  .array(
    z.object({
      kind: z.string(),
      label: z.string(),
      level: z.number().optional(),
    }),
  )
  .catch([]);

const EMPTY_INDICATORS: SignalIndicatorsDto = {
  price: 0,
  changePercent: null,
  vwap: null,
  vwapDistancePercent: null,
  vwapSlopePercent: null,
  rsi: null,
  adx: null,
  atr: null,
  atrPercent: null,
  macdHistogram: null,
  relativeVolume: null,
  barRelativeVolume: null,
  sessionVolume: null,
  ema9: null,
  ema20: null,
  ema50: null,
  dayHigh: null,
  dayLow: null,
  dayOpen: null,
  previousClose: null,
  previousHigh: null,
  previousLow: null,
  openingRangeHigh: null,
  openingRangeLow: null,
  gapPercent: null,
  trends: [],
  levels: [],
};

function toIndicators(raw: unknown): SignalIndicatorsDto {
  const parsed = snapshotSchema.parse(raw);
  return { ...EMPTY_INDICATORS, ...parsed } as SignalIndicatorsDto;
}

function toInvalidations(raw: unknown): InvalidationDto[] {
  return invalidationSchema.parse(raw).map((rule) => ({
    kind: rule.kind,
    label: rule.label,
    level: rule.level ?? null,
  }));
}

function toSignal(
  row: StoredIntradaySignal,
  sector: string | null,
  factors: readonly IntradayFactorDto[],
  reasons: readonly IntradayReasonDto[],
  timeline: readonly IntradayEventDto[],
): IntradaySignalDto {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    sector,
    kind: row.kind as IntradaySignalKind,
    direction: (row.direction === 'short' ? 'short' : 'long') satisfies TradeDirection,
    strategy: row.strategy,
    state: row.state as IntradaySignalState,
    quality: row.quality as SignalQuality,
    score: row.score,
    scoring: scoringSchema.parse(
      row.scoring !== null && typeof row.scoring === 'object' && 'score' in row.scoring
        ? row.scoring
        : null,
    ),
    regime: row.regime,
    levels: {
      entryLow: row.entryLow,
      entryHigh: row.entryHigh,
      invalidation: row.invalidationLevel,
      target1: row.target1,
      target2: row.target2,
      risk: row.riskPaise,
      reward: row.rewardPaise,
      riskReward: row.riskReward,
    },
    invalidations: toInvalidations(row.invalidations),
    indicators: toIndicators(row.indicatorSnapshot),
    factors,
    reasons,
    timeline,
    triggerMinutes: row.triggerMinutes,
    setupMinutes: row.setupMinutes,
    trendMinutes: row.trendMinutes,
    detectedAt: row.detectedAt.toISOString(),
    triggeredAt: row.triggeredAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    endReason: row.endReason,
    maxFavourable: row.maxFavourable,
    maxAdverse: row.maxAdverse,
  };
}

function toFactorDtos(
  rows: readonly {
    category: string;
    label: string;
    score: number;
    weight: number;
    points: number;
    detail: string;
  }[],
): IntradayFactorDto[] {
  return rows.map((row) => ({ ...row, category: row.category as ScoreCategory }));
}

function toReasonDtos(
  rows: readonly {
    key: string;
    label: string;
    detail: string;
    category: string;
    polarity: string;
  }[],
): IntradayReasonDto[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    detail: row.detail,
    category: row.category as ScoreCategory,
    polarity:
      row.polarity === 'opposing'
        ? 'opposing'
        : row.polarity === 'context'
          ? 'context'
          : 'supporting',
  }));
}

function toEventDtos(
  rows: readonly {
    at: Date;
    kind: string;
    message: string;
    detail: string | null;
    score: number;
    state: string;
  }[],
): IntradayEventDto[] {
  return rows.map((row) => ({
    at: row.at.toISOString(),
    kind: row.kind,
    message: row.message,
    detail: row.detail,
    score: row.score,
    state: row.state as IntradaySignalState,
  }));
}

async function build(now: Date): Promise<IntradayFeedDto> {
  if (!isDatabaseConfigured()) {
    throw new MarketDataError('The signals database is not configured.', {
      code: 'NOT_CONFIGURED',
      status: 503,
      remedy: 'Set DATABASE_URL in .env, then run pnpm db:migrate.',
    });
  }

  const db = getDatabase();
  const today = istDateKey(now);
  const regime = sessionRegime(now, DEFAULT_INTRADAY_CONFIG);

  const [status, todaysSignals, index] = await Promise.all([
    getMarketStatus(),
    getIntradaySignals(db, today),
    getIndex('nifty50'),
  ]);

  // Over a weekend or a holiday, today has nothing. Falling back to the last
  // session that does is more useful than a blank page — provided the UI keeps
  // saying which session it is looking at, which `tradingDate` and the
  // market-closed banner both do.
  const isOpenNow = status?.isOpen ?? false;
  const tradingDate =
    todaysSignals.length > 0 || isOpenNow ? today : ((await latestIntradaySignalDate(db)) ?? today);

  const [rows, summary, run] = await Promise.all([
    tradingDate === today ? Promise.resolve(todaysSignals) : getIntradaySignals(db, tradingDate),
    getIntradaySummary(db, tradingDate),
    latestIntradayRun(db, tradingDate),
  ]);

  const sectorBySymbol = new Map(
    (index?.constituents ?? []).map((constituent) => [constituent.symbol, constituent.sector]),
  );

  const ids = rows.map((row) => row.id);
  const [factors, reasons, events] = await Promise.all([
    getIntradayFactorsFor(db, ids),
    getIntradayReasonsFor(db, ids),
    getIntradayEventsFor(db, ids),
  ]);

  const signals = rows.map((row) =>
    toSignal(
      row,
      sectorBySymbol.get(row.symbol) ?? null,
      toFactorDtos(factors.get(row.id) ?? []),
      toReasonDtos(reasons.get(row.id) ?? []),
      toEventDtos(events.get(row.id) ?? []),
    ),
  );

  const isOpen = isOpenNow && tradingDate === today;
  const lastPass = run?.finishedAt ?? run?.startedAt ?? null;
  // Staleness is only meaningful while the market is open. After the close the
  // feed is deliberately historical, and badging it "stale" would misdescribe it.
  const stale =
    isOpen && (lastPass === null || now.getTime() - lastPass.getTime() > STALE_AFTER_MS);

  return {
    tradingDate,
    market: { isOpen, phase: status?.phase ?? 'unknown' },
    regime,
    run:
      run === null
        ? null
        : {
            startedAt: run.startedAt.toISOString(),
            finishedAt: run.finishedAt?.toISOString() ?? null,
            status: run.status,
            regime: run.regime,
            symbolsEvaluated: run.symbolsEvaluated,
            error: run.error,
          },
    summary,
    signals,
    fetchedAt: now.toISOString(),
    refreshAfterSeconds: isOpen ? OPEN_REFRESH_SECONDS : CLOSED_REFRESH_SECONDS,
    stale,
    notice: noticeFor({ isOpen, tradingDate, regime, run, signals: signals.length, now, stale }),
  };
}

/**
 * Why the feed looks the way it does.
 *
 * An empty list has several very different causes — a closed market, a
 * warming-up session, a genuinely quiet one, and a worker that is not running.
 * Showing the same blank panel for all four would make the last of them
 * invisible, which is the one that actually needs acting on.
 */
function noticeFor(input: {
  isOpen: boolean;
  tradingDate: string;
  regime: string;
  run: { finishedAt: Date | null; startedAt: Date; status: string } | null;
  signals: number;
  now: Date;
  stale: boolean;
}): string | null {
  const { isOpen, regime, run, signals, now, stale } = input;

  if (!isOpen && !isRegularSession(now)) {
    return signals === 0
      ? 'The market is closed and no intraday setups were recorded for this session.'
      : `The market is closed. These are the setups recorded during the ${input.tradingDate} session — history, not live opportunities.`;
  }
  if (run === null) {
    return 'The signal engine has not run for this session yet. Start the worker with `pnpm --filter @signal/worker dev`.';
  }
  if (stale) {
    return 'The signal engine has not completed a pass recently. These setups may no longer be valid.';
  }
  if (run.status === 'failed') {
    return 'The last engine pass failed. The setups shown are from an earlier pass.';
  }
  if (signals === 0) {
    return regime === 'opening'
      ? `${REGIME_LABEL.opening} — the engine is waiting for enough of the session to form a reliable read.`
      : 'No setups currently meet the quality threshold. Quality is filtered deliberately; a quiet feed is a normal outcome.';
  }
  return null;
}

/** The feed, cached briefly and shared between concurrent requests. */
export async function getIntradayFeed(now = new Date()): Promise<IntradayFeedDto> {
  const cached = cache;
  if (cached !== null && cached.expiresAt > now.getTime()) return cached.feed;

  const existing = inFlight;
  if (existing !== null) return existing;

  const pending = build(now)
    .then((feed) => {
      cache = { feed, expiresAt: now.getTime() + CACHE_TTL_MS };
      return feed;
    })
    .finally(() => {
      inFlight = null;
    });

  inFlight = pending;
  return pending;
}

/** One signal with its full timeline, for the detail view. */
export async function getIntradaySignal(id: number): Promise<IntradaySignalDto | null> {
  if (!isDatabaseConfigured()) {
    throw new MarketDataError('The signals database is not configured.', {
      code: 'NOT_CONFIGURED',
      status: 503,
      remedy: 'Set DATABASE_URL in .env, then run pnpm db:migrate.',
    });
  }

  const detail = await getIntradaySignalDetail(getDatabase(), id);
  if (detail === null) return null;

  const index = await getIndex('nifty50');
  const sector =
    index?.constituents.find((constituent) => constituent.symbol === detail.signal.symbol)
      ?.sector ?? null;

  return toSignal(
    detail.signal,
    sector,
    toFactorDtos(detail.factors),
    toReasonDtos(detail.reasons),
    toEventDtos(detail.events),
  );
}

/* ---------------------------------------------------------------------------
 * Chart data
 * -------------------------------------------------------------------------*/

export interface SignalChartBar {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

export interface SignalChartDto {
  readonly symbol: string;
  readonly tradingDate: string;
  /** Bucket size in minutes. The signal's own setup timeframe. */
  readonly minutes: number;
  readonly bars: readonly SignalChartBar[];
  /** Overlays aligned to `bars`; `null` where the indicator has not warmed up. */
  readonly vwap: readonly (number | null)[];
  readonly ema9: readonly (number | null)[];
  readonly ema20: readonly (number | null)[];
  /** Horizontal reference lines, paise. */
  readonly levels: readonly {
    readonly label: string;
    readonly price: number;
    readonly kind: string;
  }[];
  /** Where the signal triggered, as an epoch-ms instant. Null before it does. */
  readonly triggeredAt: string | null;
  readonly direction: TradeDirection;
  readonly entryLow: number;
  readonly entryHigh: number;
  readonly invalidation: number;
  readonly target1: number;
  readonly target2: number;
}

/**
 * Chart data for one signal's session.
 *
 * Bars come from stored 1m candles and are bucketed with the SAME pure
 * function the engine uses, so the chart cannot show a candle the engine never
 * saw. The overlays are computed server-side from `@signal/core` for the same
 * reason — a VWAP re-derived in the browser could differ from the VWAP the
 * signal was scored against, and the user would have no way of knowing which
 * one was real.
 */
export async function getSignalChart(id: number, now = new Date()): Promise<SignalChartDto | null> {
  if (!isDatabaseConfigured()) {
    throw new MarketDataError('The signals database is not configured.', {
      code: 'NOT_CONFIGURED',
      status: 503,
      remedy: 'Set DATABASE_URL in .env, then run pnpm db:migrate.',
    });
  }

  const db = getDatabase();
  const detail = await getIntradaySignalDetail(db, id);
  if (detail === null) return null;

  const { signal } = detail;
  const ids = await resolveInstrumentIds(db, [signal.symbol]);
  const instrumentId = ids.get(signal.symbol);
  if (instrumentId === undefined) return null;

  // The signal's own trading date, not today: a signal is looked at after the
  // fact as often as during, and charting the wrong session would be worse
  // than charting none.
  const sessionStart = new Date(`${signal.tradingDate}T00:00:00+05:30`);
  const sessionEnd = new Date(sessionStart.getTime() + 24 * 60 * 60_000);
  const to = sessionEnd.getTime() < now.getTime() ? sessionEnd : now;

  const minute = await getMinuteBars(db, {
    instrumentId,
    from: sessionStart,
    to,
    raw: true,
  });

  const minutes = signal.setupMinutes;
  const bars = bucketBars(minute, minutes, { now: to });
  const closes = bars.map((bar) => bar.close);

  const indicators = toIndicators(signal.indicatorSnapshot);
  const levels = indicators.levels
    .filter((level) => level.significance >= 0.6)
    .map((level) => ({ label: level.label, price: level.price, kind: level.kind }));

  return {
    symbol: signal.symbol,
    tradingDate: signal.tradingDate,
    minutes,
    bars: bars.map((bar) => ({
      t: bar.timestamp,
      o: bar.open,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      v: bar.volume,
    })),
    vwap: vwap(bars),
    ema9: ema(closes, 9),
    ema20: ema(closes, 20),
    levels,
    triggeredAt: signal.triggeredAt?.toISOString() ?? null,
    direction: signal.direction === 'short' ? 'short' : 'long',
    entryLow: signal.entryLow,
    entryHigh: signal.entryHigh,
    invalidation: signal.invalidationLevel,
    target1: signal.target1,
    target2: signal.target2,
  };
}
