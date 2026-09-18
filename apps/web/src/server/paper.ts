import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  calendarExpiresSoon,
  equitySnapshot,
  markNet,
  ORB_CONFIG,
  PAPER_COSTS,
  paperPerformance,
  paperPerformanceBy,
  STRATEGY_CATALOGUE,
  sessionFor,
} from '@equitywise/core';
import {
  ensurePaperPortfolio,
  getExchangeSession,
  getWorkerCheckpoint,
  latestSignalQuoteAt,
  listClosedPaperTrades,
  listPaperAudit,
  listPaperDecisions,
  listPaperEvents,
  listPaperSnapshots,
  listPaperTradesDetailed,
  listPaperTradesForPerformance,
  listUserRiskEvents,
  PaperConflict,
  type PaperPortfolioView,
  type PaperTradeDetail,
  type PaperTradeFilter,
  paperDailyNet,
  paperHealth,
  paperLedgerBalances,
  paperMarks,
  setPaperStrategy,
  updatePaperSettings,
} from '@equitywise/db';
import {
  type CalendarConfig,
  calendarConfigSchema,
  type ExchangeSession,
  istDateKey,
  istMinutesOfDay,
  type PaperActivity,
  type PaperHealth,
  type PaperOpenTrade,
  type PaperOverview,
  type PaperPerformanceReport,
  type PaperPhase,
  type PaperPosition,
  type PaperRange,
  type PaperSettingsResponse,
  type PaperTradesPage,
  paperActivitySchema,
  paperAuditResponseSchema,
  paperEmergencyStopSchema,
  paperHealthSchema,
  paperOverviewSchema,
  paperPerformanceReportSchema,
  paperSettingsResponseSchema,
  paperSettingsUpdateSchema,
  paperStrategyUpdateSchema,
  paperTradesPageSchema,
} from '@equitywise/shared';
import { NextResponse } from 'next/server';
import { parse } from 'yaml';
import { z } from 'zod';
import { unauthenticated } from './auth/http';
import { clientIp, isSameOrigin } from './auth/request';
import { getAdminUser, getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { getMarketStatus } from './market-status';
import { describeDataSources } from './provider';

/**
 * Read side and the three user-writable actions of per-user paper trading
 * (docs/planning/paper-trading-plan.md §8). This layer never sizes, fills or
 * closes a paper trade: the worker is the only writer of orders, fills,
 * positions and the ledger. The page writes settings, strategy assignments
 * and the emergency stop, each with an audit row.
 */
const CALENDAR_PATH = join(process.cwd(), '..', '..', 'config', 'nse-calendar.yaml');
let calendarCache: { at: number; config: CalendarConfig } | null = null;
async function calendar(): Promise<CalendarConfig> {
  if (calendarCache && Date.now() - calendarCache.at < 300_000) return calendarCache.config;
  const config = calendarConfigSchema.parse(parse(await readFile(CALENDAR_PATH, 'utf8')));
  calendarCache = { at: Date.now(), config };
  return config;
}
async function sessionOn(tradingDate: string): Promise<ExchangeSession> {
  const stored = await getExchangeSession(getDatabase(), tradingDate);
  return stored ?? sessionFor(tradingDate, await calendar());
}

const strategies = () =>
  STRATEGY_CATALOGUE.map((s) => ({
    id: s.id,
    name: s.name,
    shortName: s.shortName,
    revision: s.revision,
    timeframe: s.timeframe,
    strength: s.strength,
    rules: [...s.rules],
    parameters: s.parameters,
  }));

// ---------------------------------------------------------------------------
// HTTP plumbing

const NO_STORE = { 'Cache-Control': 'no-store' };
function fail(message: string, status: number, code: string, remedy?: string): NextResponse {
  return NextResponse.json(
    { error: message, code, ...(remedy === undefined ? {} : { remedy }) },
    { status, headers: NO_STORE },
  );
}
async function authenticated(
  run: (userId: number) => Promise<unknown>,
  options: { admin?: boolean } = {},
): Promise<NextResponse> {
  try {
    const user = options.admin ? await getAdminUser() : await getSessionUser();
    if (!user)
      return options.admin ? fail('Admin access required.', 403, 'FORBIDDEN') : unauthenticated();
    return NextResponse.json(await run(user.id), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof z.ZodError)
      return fail(error.issues[0]?.message ?? 'Invalid request.', 400, 'INVALID_INPUT');
    if (error instanceof PaperConflict) return fail(error.message, error.status, 'PAPER_CONFLICT');
    console.error('[paper] request failed', {
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Paper trading data is temporarily unavailable.', code: 'PAPER_UNAVAILABLE' },
      { status: 503, headers: { ...NO_STORE, 'Retry-After': '30' } },
    );
  }
}

/**
 * Mutations: same origin, JSON, a small body, and an idempotency key so a
 * retried click cannot toggle twice. Keys are remembered per process for an
 * hour — one web process serves the site, and a replay after that is a new
 * intention anyway.
 */
const IDEMPOTENCY_TTL_MS = 60 * 60_000;
const seen = new Map<string, { at: number; body: unknown }>();
function remember(userId: number, key: string, body: unknown) {
  const now = Date.now();
  for (const [k, v] of seen) if (now - v.at > IDEMPOTENCY_TTL_MS) seen.delete(k);
  seen.set(`${userId}:${key}`, { at: now, body });
}
async function mutation<T>(
  request: Request,
  schema: z.ZodType<T>,
  run: (userId: number, body: T, ip: string | null) => Promise<unknown>,
): Promise<NextResponse> {
  if (!isSameOrigin(request)) return fail('Cross-site request rejected.', 403, 'FORBIDDEN_ORIGIN');
  if (!(request.headers.get('content-type') ?? '').includes('application/json'))
    return fail('Send JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE');
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 4_096) return fail('Request too large.', 413, 'PAYLOAD_TOO_LARGE');
    raw = JSON.parse(text);
  } catch {
    return fail('Request body is not valid JSON.', 400, 'INVALID_BODY');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return fail(parsed.error.issues[0]?.message ?? 'Invalid request.', 400, 'INVALID_INPUT');
  const body = parsed.data as T & { idempotencyKey: string };
  return authenticated(async (userId) => {
    const replay = seen.get(`${userId}:${body.idempotencyKey}`);
    if (replay) return replay.body;
    const result = await run(userId, parsed.data, clientIp(request));
    remember(userId, body.idempotencyKey, result);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Reads

function phaseAt(now: number, session: ExchangeSession, marketOpen: boolean | null): PaperPhase {
  if (session.openAt === null || session.closeAt === null || marketOpen === false) return 'CLOSED';
  if (now < session.openAt) return now >= session.openAt - 15 * 60_000 ? 'PRE_OPEN' : 'CLOSED';
  if (now >= session.closeAt) return 'CLOSED';
  const minute = istMinutesOfDay(new Date(now));
  if (session.kind === 'NORMAL' && minute < ORB_CONFIG.firstSignalCloseMinute)
    return 'OPENING_RANGE';
  if (session.squareOffAt !== null && now >= session.squareOffAt) return 'SQUARE_OFF';
  if (session.entryCutoffAt !== null && now > session.entryCutoffAt) return 'AFTER_ENTRIES';
  return 'SESSION';
}

function openTrade(
  t: PaperTradeDetail,
  mark: { price: number; at: number } | undefined,
): PaperOpenTrade {
  return {
    ...t.position,
    decidedShares: t.decidedShares,
    levels: t.levels,
    lastPrice: mark?.price ?? null,
    quoteAt: mark?.at ?? null,
    markNetPaise:
      t.position.status === 'CLOSED'
        ? t.position.netRealisedPaise
        : markNet(t.evidence, t.position.projection, mark?.price ?? null),
    squareOffAt: t.squareOffAt,
  };
}

async function tradesWithMarks(details: readonly PaperTradeDetail[]): Promise<PaperOpenTrade[]> {
  const marks = await paperMarks(
    getDatabase(),
    details.map((t) => t.position.instrumentId),
  );
  return details.map((t) => openTrade(t, marks.get(t.position.instrumentId)));
}

export async function paperOverview(userId: number, now: number): Promise<PaperOverview> {
  const db = getDatabase();
  const view = await ensurePaperPortfolio(db, userId, now);
  const tradingDate = istDateKey(new Date(now));
  const [session, status, balancesRow, live, today, decisions, halts, lastQuoteAt, monitor] =
    await Promise.all([
      sessionOn(tradingDate),
      getMarketStatus(),
      paperLedgerBalances(db, view.portfolio.id),
      listPaperTradesDetailed(db, userId, { live: true }),
      listPaperTradesDetailed(db, userId, { tradingDate }),
      listPaperDecisions(db, userId, tradingDate),
      listUserRiskEvents(db, userId, 10),
      latestSignalQuoteAt(db),
      getWorkerCheckpoint(db, 'paper-monitor'),
    ]);
  const openTrades = await tradesWithMarks(live);
  const snapshot = equitySnapshot(
    balancesRow.balances,
    openTrades.map((t) => ({ position: t, markNetPaise: t.markNetPaise })),
    Math.max(
      view.portfolio.startingCapitalPaise,
      balancesRow.balances.cashPaise +
        balancesRow.balances.reservedPaise +
        balancesRow.balances.lockedPaise,
    ),
  );
  const closedToday = today.filter((t) => t.position.status === 'CLOSED');
  const realised = closedToday.reduce((s, t) => s + t.position.netRealisedPaise, 0);
  const unrealised = snapshot.unrealisedPaise;
  const sources = describeDataSources();
  const feedName = sources.routes.find((r) => r.route === 'stream')?.provider ?? sources.active;
  const phase = phaseAt(now, session, status?.isOpen ?? null);
  const inSession = phase !== 'CLOSED' && phase !== 'PRE_OPEN';
  const workerCycleAt = typeof monitor?.lastRunAt === 'number' ? monitor.lastRunAt : null;
  const mode: PaperOverview['feed']['mode'] = !inSession
    ? 'CLOSED'
    : lastQuoteAt !== null && now - lastQuoteAt <= ORB_CONFIG.coverageGapMs
      ? 'LIVE'
      : lastQuoteAt === null
        ? 'UNAVAILABLE'
        : 'STALE';
  return paperOverviewSchema.parse({
    serverNow: now,
    sessionDate: tradingDate,
    portfolio: {
      startingCapitalPaise: view.portfolio.startingCapitalPaise,
      createdAt: view.portfolio.createdAt,
    },
    settings: view.settings,
    assignments: view.assignments,
    strategies: strategies(),
    session,
    phase,
    feed: {
      name: feedName,
      mode,
      lastQuoteAt,
      workerCycleAt,
      workerDelayed: inSession && (workerCycleAt === null || now - workerCycleAt > 30_000),
    },
    balances: snapshot,
    today: {
      realisedPaise: realised,
      unrealisedPaise: unrealised,
      netPaise: unrealised === null ? null : realised + unrealised,
      trades: today.filter((t) => t.position.openedAt !== null).length,
      open: openTrades.length,
      decided: decisions.length,
      rejected: decisions.filter((d) => d.status === 'REJECTED').length,
    },
    openTrades,
    halts: halts.filter((h) => h.resolvedAt === null),
    simulation: { tier: 'Quote-based simulation', chargesVersion: PAPER_COSTS.version },
  });
}

const settingsResponse = (view: PaperPortfolioView): PaperSettingsResponse =>
  paperSettingsResponseSchema.parse({
    settings: view.settings,
    assignments: view.assignments,
    strategies: strategies(),
  });

export async function paperActivity(userId: number, tradingDate: string): Promise<PaperActivity> {
  const db = getDatabase();
  const [decisions, details] = await Promise.all([
    listPaperDecisions(db, userId, tradingDate),
    listPaperTradesDetailed(db, userId, { tradingDate }),
  ]);
  const events = await listPaperEvents(
    db,
    userId,
    details.map((t) => t.position.id),
  );
  const symbols = new Map(details.map((t) => [t.position.id, t.position.symbol]));
  return paperActivitySchema.parse({
    sessionDate: tradingDate,
    decisions: decisions.map((d) => ({
      ...d,
      sizing: d.decision.sizing,
      counts: d.decision.counts,
    })),
    events: events.map((e) => ({
      positionId: e.positionId,
      symbol: symbols.get(e.positionId) ?? '',
      sequence: e.sequence,
      kind: e.kind,
      at: e.at.getTime(),
      pricePaise: e.pricePaise,
      shares: e.shares,
      explanation: e.explanation,
    })),
    trades: await tradesWithMarks(details),
  });
}

const tradesQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  symbol: z.string().min(1).max(20).optional(),
  strategyId: z.string().min(1).max(40).optional(),
  strategyVersionId: z.coerce.number().int().positive().optional(),
  outcome: z.enum(['WIN', 'LOSS', 'BREAKEVEN', 'UNRESOLVED']).optional(),
  exitReason: z.string().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  format: z.enum(['json', 'csv']).default('json'),
});

export async function paperTrades(
  userId: number,
  query: z.infer<typeof tradesQuerySchema>,
): Promise<PaperTradesPage> {
  const db = getDatabase();
  const filter: PaperTradeFilter = {};
  if (query.from) filter.from = query.from;
  if (query.to) filter.to = query.to;
  if (query.symbol) filter.symbol = query.symbol;
  if (query.strategyId) filter.strategyId = query.strategyId;
  if (query.strategyVersionId !== undefined) filter.strategyVersionId = query.strategyVersionId;
  if (query.outcome) filter.outcome = query.outcome;
  if (query.exitReason) filter.exitReason = query.exitReason;
  const { trades, total } = await listClosedPaperTrades(db, userId, filter, query);
  const details = await listPaperTradesDetailed(db, userId, { ids: trades.map((t) => t.id) });
  const byId = new Map(details.map((d) => [d.position.id, d]));
  const ordered = trades.flatMap((t) => {
    const d = byId.get(t.id);
    return d ? [d] : [];
  });
  return paperTradesPageSchema.parse({
    trades: await tradesWithMarks(ordered),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
}

const RANGE_DAYS: Record<PaperRange, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };
function rangeStart(range: PaperRange, now: number): string | null {
  const days = RANGE_DAYS[range];
  return days === null ? null : istDateKey(new Date(now - (days - 1) * 86_400_000));
}

export async function paperPerformanceReport(
  userId: number,
  range: PaperRange,
  now: number,
): Promise<PaperPerformanceReport> {
  const db = getDatabase();
  const view = await ensurePaperPortfolio(db, userId, now);
  const from = rangeStart(range, now);
  const [trades, snapshots, dailyNet] = await Promise.all([
    listPaperTradesForPerformance(db, userId, from),
    listPaperSnapshots(db, userId, from),
    paperDailyNet(db, userId, from),
  ]);
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownBps: number | null = null;
  for (const s of snapshots) {
    if (s.equityPaise === null) continue;
    peak = Math.max(peak, s.equityPaise);
    const dd = peak - s.equityPaise;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownBps = peak > 0 ? (dd * 10_000) / peak : null;
    }
  }
  const exitReason = (p: PaperPosition) => p.exitReason ?? 'OPEN';
  return paperPerformanceReportSchema.parse({
    range,
    from,
    portfolio: paperPerformance('portfolio', trades),
    byStrategy: paperPerformanceBy(trades, (p) => p.strategyId),
    byVersion: paperPerformanceBy(trades, (p) => `${p.strategyId}@${p.strategyVersionId}`),
    byInstrument: paperPerformanceBy(trades, (p) => p.symbol),
    byExitReason: paperPerformanceBy(trades, exitReason),
    equityCurve: snapshots.map((s) => ({ at: s.at, equityPaise: s.equityPaise })),
    dailyNet,
    maxDrawdown: { paise: maxDrawdown, bps: maxDrawdownBps },
    startingCapitalPaise: view.portfolio.startingCapitalPaise,
  });
}

export async function paperHealthReport(now: number): Promise<PaperHealth> {
  const db = getDatabase();
  const tradingDate = istDateKey(new Date(now));
  const [session, config, lastQuoteAt] = await Promise.all([
    sessionOn(tradingDate),
    calendar(),
    latestSignalQuoteAt(db),
  ]);
  const health = await paperHealth(db, session.closeAt);
  const inSession =
    session.openAt !== null &&
    session.closeAt !== null &&
    now >= session.openAt &&
    now < session.closeAt;
  return paperHealthSchema.parse({
    serverNow: now,
    session,
    calendar: {
      verifiedThrough: config.verifiedThrough,
      expiresSoon: calendarExpiresSoon(tradingDate, config),
    },
    feed: {
      mode: !inSession
        ? 'CLOSED'
        : lastQuoteAt !== null && now - lastQuoteAt <= ORB_CONFIG.coverageGapMs
          ? 'LIVE'
          : lastQuoteAt === null
            ? 'UNAVAILABLE'
            : 'STALE',
      lastQuoteAt,
    },
    ...health,
  });
}

// ---------------------------------------------------------------------------
// Route handlers

export const readPaperOverview = () => authenticated((userId) => paperOverview(userId, Date.now()));
export const readPaperSettings = () =>
  authenticated(async (userId) =>
    settingsResponse(await ensurePaperPortfolio(getDatabase(), userId, Date.now())),
  );
export const writePaperSettings = (request: Request) =>
  mutation(request, paperSettingsUpdateSchema, async (userId, body, ip) => {
    const { expectedVersion, idempotencyKey: _k, ...rest } = body;
    // Drop unset keys: the patch treats a present key as an intention.
    const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    await ensurePaperPortfolio(getDatabase(), userId, Date.now());
    return settingsResponse(
      await updatePaperSettings(getDatabase(), userId, patch, {
        expectedVersion,
        now: Date.now(),
        ipAddress: ip,
      }),
    );
  });
export const readPaperStrategies = readPaperSettings;
export const writePaperStrategy = (request: Request) =>
  mutation(request, paperStrategyUpdateSchema, async (userId, body, ip) => {
    const { idempotencyKey: _k, ...assignment } = body;
    if (!STRATEGY_CATALOGUE.some((s) => s.id === assignment.strategyId))
      throw new PaperConflict('Unknown strategy.', 404);
    await ensurePaperPortfolio(getDatabase(), userId, Date.now());
    return settingsResponse(
      await setPaperStrategy(getDatabase(), userId, assignment, { now: Date.now(), ipAddress: ip }),
    );
  });
export const writePaperEmergencyStop = (request: Request) =>
  mutation(request, paperEmergencyStopSchema, async (userId, body, ip) => {
    const db = getDatabase();
    const view = await ensurePaperPortfolio(db, userId, Date.now());
    return settingsResponse(
      await updatePaperSettings(
        db,
        userId,
        { entriesPaused: body.paused },
        { expectedVersion: view.settings.settingsVersion, now: Date.now(), ipAddress: ip },
      ),
    );
  });
export const readPaperOpenTrades = () =>
  authenticated(async (userId) => ({
    trades: await tradesWithMarks(
      await listPaperTradesDetailed(getDatabase(), userId, { live: true }),
    ),
  }));
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
export const readPaperActivity = (request: Request) =>
  authenticated((userId) => {
    const date = new URL(request.url).searchParams.get('date');
    return paperActivity(userId, date ? dateSchema.parse(date) : istDateKey(new Date()));
  });
export async function readPaperTrades(request: Request): Promise<NextResponse> {
  const query = tradesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!query.success)
    return fail(query.error.issues[0]?.message ?? 'Invalid query.', 400, 'INVALID_INPUT');
  if (query.data.format === 'csv') {
    const user = await getSessionUser();
    if (!user) return unauthenticated();
    const page = await paperTrades(user.id, { ...query.data, page: 1, pageSize: 100 });
    return new NextResponse(tradesCsv(page.trades), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="paper-trades.csv"',
      },
    });
  }
  return authenticated((userId) => paperTrades(userId, query.data));
}
export const readPaperPerformance = (request: Request) =>
  authenticated((userId) => {
    const range = new URL(request.url).searchParams.get('range') ?? '30d';
    return paperPerformanceReport(
      userId,
      z.enum(['7d', '30d', '90d', 'all']).parse(range),
      Date.now(),
    );
  });
export const readPaperAudit = () =>
  authenticated(async (userId) =>
    paperAuditResponseSchema.parse({
      events: (await listPaperAudit(getDatabase(), userId)).map((e) => ({
        at: e.at.getTime(),
        event: e.event,
        detail: e.detail,
      })),
    }),
  );
export const readPaperHealth = () =>
  authenticated(() => paperHealthReport(Date.now()), { admin: true });

/** The same filtered set as the JSON page, as CSV. Money in rupees with two decimals. */
export function tradesCsv(trades: readonly PaperOpenTrade[]): string {
  const rupees = (p: number | null) => (p === null ? '' : (p / 100).toFixed(2));
  const ist = (at: number | null) =>
    at === null
      ? ''
      : new Date(at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
  const header = [
    'symbol',
    'direction',
    'strategy',
    'version',
    'opened_at_ist',
    'closed_at_ist',
    'shares_simulated',
    'entry_level',
    'stop_level',
    'target_1',
    'target_2',
    'exit_reason',
    'gross_result',
    'estimated_charges',
    'net_result',
    'amount_risked',
    'resolution',
  ];
  const rows = trades.map((t) => [
    t.symbol,
    t.direction,
    t.strategyId,
    String(t.strategyVersionId),
    ist(t.openedAt),
    ist(t.closedAt),
    String(t.projection.shares),
    rupees(t.projection.fill),
    rupees(t.levels.stop),
    rupees(t.levels.target1),
    rupees(t.levels.target2),
    t.exitReason ?? '',
    rupees(t.grossRealisedPaise),
    rupees(t.chargesPaise),
    rupees(t.netRealisedPaise),
    rupees(t.initialRiskPaise),
    t.projection.resolution,
  ]);
  const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return [header, ...rows].map((r) => r.map(quote).join(',')).join('\n');
}
