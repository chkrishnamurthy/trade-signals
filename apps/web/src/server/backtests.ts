import 'server-only';
import { type PaperTrade, summarisePaperTrades } from '@equitywise/core';
import { getBacktestRun, getBacktestTrades, listBacktestRuns } from '@equitywise/db';
import { getDatabase, isDatabaseConfigured } from './db';
import type { PaperBucket, PaperResultsDto, PaperTradeRow } from './paper-trades';

/**
 * Backtest results, for reading.
 *
 * Reads only, and reads only `backtest_*` tables. Runs are produced by
 * `pnpm backtest:intraday`; this layer never executes the engine and cannot
 * reach `intraday_signals` or `paper_trades`, which is what keeps a replayed
 * result from ever being mistaken for a live one.
 *
 * The `results` field is deliberately shaped as `PaperResultsDto` — the exact
 * DTO `/signals/performance` renders. Two consequences, both wanted:
 *
 *  - every statistic on a backtest page is produced by `summarisePaperTrades`
 *    from `@equitywise/core`, the same function that graded the live paper
 *    trades, so the two pages can never quietly disagree about what
 *    "expectancy" means;
 *  - the whole of `@/lib/paper-display` — verdicts, bucket ranking, attention
 *    items — applies unchanged.
 *
 * Every figure is per share, in paise, and results are in R. No money, no
 * quantity, no position (CLAUDE.md).
 */

export interface BacktestRunRow {
  readonly id: string;
  readonly label: string | null;
  readonly status: string;
  readonly barSource: string;
  readonly datasetId: string | null;
  readonly gitRevision: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly cycleMinutes: number;
  readonly sessionsTotal: number;
  readonly sessionsDone: number;
  readonly evaluations: number;
  readonly signalsGenerated: number;
  readonly tradesRecorded: number;
  /**
   * False when today's index membership was applied to past dates.
   *
   * Surfaced on every row rather than buried in a detail view: it is the single
   * caveat most likely to make a good-looking number wrong, and a caveat the
   * reader has to go looking for is a caveat that does not exist.
   */
  readonly universeDated: boolean;
  readonly universeSize: number;
  /** Config overrides applied on top of the strategy version, as label/value. */
  readonly overrides: readonly { readonly key: string; readonly value: string }[];
  readonly error: string | null;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  /** Wall-clock duration in seconds, once finished. */
  readonly durationSeconds: number | null;
  /** Headline expectancy, denormalised on the run so a list needs no scan. */
  readonly expectancyR: number | null;
  readonly hitRate: number | null;
}

export interface BacktestListDto {
  readonly configured: boolean;
  readonly runs: readonly BacktestRunRow[];
}

export interface RejectionRow {
  readonly reason: string;
  readonly count: number;
  /** Share of all rejections, 0-1. */
  readonly share: number;
}

export interface BacktestDetailDto {
  readonly configured: boolean;
  readonly run: BacktestRunRow | null;
  /** Shaped exactly like the live performance DTO. See the module comment. */
  readonly results: PaperResultsDto;
  /**
   * Why setups never became trades, most common first.
   *
   * The most useful panel on the page when the trade count is low: it is the
   * difference between "the market was quiet" and "a filter is set wrong",
   * which look identical from a trade list alone.
   */
  readonly rejections: readonly RejectionRow[];
  readonly rejectionTotal: number;
}

const EMPTY_RESULTS: PaperResultsDto = {
  configured: false,
  trades: [],
  sessions: 0,
  open: 0,
  summary: {
    trades: 0,
    wins: 0,
    losses: 0,
    hitRate: 0,
    expectancyR: 0,
    profitFactor: null,
    averageWinR: 0,
    averageLossR: 0,
    averageBarsHeld: 0,
    breakevenHitRate: null,
  },
  byScore: [],
  byStrategy: [],
  byExit: [],
  byRegime: [],
  byDirection: [],
  bySession: [],
  marginOfErrorPoints: null,
};

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

/** A stored `date` column arrives as a string or a Date depending on driver. */
function dateKey(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return '';
}

function readSummaryNumber(summary: unknown, key: string): number | null {
  if (summary === null || typeof summary !== 'object') return null;
  const value = (summary as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toOverrides(raw: unknown): { key: string; value: string }[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const LABELS: Record<string, string> = {
    minScore: 'Score floor',
    stopAtr: 'Stop × ATR',
    target1Atr: 'Target × ATR',
  };
  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
    key: LABELS[key] ?? key,
    value: String(value),
  }));
}

function toRunRow(row: Awaited<ReturnType<typeof getBacktestRun>>): BacktestRunRow | null {
  if (row === null) return null;
  const started = row.startedAt;
  const finished = row.finishedAt;
  return {
    id: String(row.id),
    label: row.label,
    status: row.status,
    barSource: row.barSource,
    datasetId: row.datasetId,
    gitRevision: row.gitRevision.slice(0, 8),
    fromDate: dateKey(row.fromDate),
    toDate: dateKey(row.toDate),
    cycleMinutes: row.cycleMinutes,
    sessionsTotal: row.sessionsTotal,
    sessionsDone: row.sessionsDone,
    evaluations: Number(row.evaluations),
    signalsGenerated: row.signalsGenerated,
    tradesRecorded: row.tradesRecorded,
    universeDated: row.universeDated,
    universeSize: Array.isArray(row.universe) ? row.universe.length : 0,
    overrides: toOverrides(row.overrides),
    error: row.error,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: started === null ? null : started.toISOString(),
    finishedAt: finished === null ? null : finished.toISOString(),
    durationSeconds:
      started === null || finished === null
        ? null
        : Math.round((finished.getTime() - started.getTime()) / 1000),
    expectancyR: readSummaryNumber(row.summary, 'expectancyR'),
    hitRate: readSummaryNumber(row.summary, 'hitRate'),
  };
}

/** Rebuilds a core `PaperTrade` from a stored row, for summarising only. */
function asPaperTrade(row: PaperTradeRow): PaperTrade {
  return {
    direction: row.direction,
    entryAt: Date.parse(row.entryAt),
    entryPrice: row.entryPrice,
    exitAt: Date.parse(row.exitAt),
    exitPrice: row.exitPrice,
    exitReason: row.exitReason as PaperTrade['exitReason'],
    grossPaise: row.grossPaise,
    costPaise: row.costPaise,
    netPaise: row.netPaise,
    rMultiple: row.rMultiple,
    maxFavourable: row.maxFavourable,
    maxAdverse: row.maxAdverse,
    barsHeld: row.barsHeld,
    reachedTarget2: false,
  };
}

function bucket(rows: readonly PaperTradeRow[], label: string): PaperBucket {
  const stats = summarisePaperTrades(rows.map(asPaperTrade));
  return {
    label,
    trades: stats.trades,
    hitRate: stats.hitRate,
    expectancyR: stats.expectancyR,
    profitFactor: stats.profitFactor,
  };
}

function group(rows: readonly PaperTradeRow[], key: (row: PaperTradeRow) => string): PaperBucket[] {
  const groups = new Map<string, PaperTradeRow[]>();
  for (const row of rows) {
    const name = key(row);
    const list = groups.get(name) ?? [];
    list.push(row);
    groups.set(name, list);
  }
  return [...groups.entries()]
    .map(([name, list]) => bucket(list, name))
    .filter((entry) => entry.trades > 0)
    .sort((a, b) => b.trades - a.trades);
}

function scoreBand(score: number): string {
  if (score >= 90) return '90+ exceptional';
  if (score >= 80) return '80–89 strong';
  if (score >= 70) return '70–79 good';
  return '60–69 watch';
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBacktestList(limit = 50): Promise<BacktestListDto> {
  if (!isDatabaseConfigured()) return { configured: false, runs: [] };

  const rows = await listBacktestRuns(getDatabase(), limit);
  return {
    configured: true,
    runs: rows.map((row) => toRunRow(row)).filter((row): row is BacktestRunRow => row !== null),
  };
}

export async function getBacktestDetail(runId: number): Promise<BacktestDetailDto> {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      run: null,
      results: EMPTY_RESULTS,
      rejections: [],
      rejectionTotal: 0,
    };
  }

  const db = getDatabase();
  const stored = await getBacktestRun(db, runId);
  const run = toRunRow(stored);
  if (stored === null || run === null) {
    return {
      configured: true,
      run: null,
      results: EMPTY_RESULTS,
      rejections: [],
      rejectionTotal: 0,
    };
  }

  const trades = await getBacktestTrades(db, runId);
  const rows: PaperTradeRow[] = trades.map((row) => ({
    id: String(row.id),
    signalId: String(row.signalId),
    symbol: row.symbol,
    tradingDate: dateKey(row.tradingDate),
    kind: row.kind,
    strategy: row.strategy,
    direction: row.direction === 'short' ? 'short' : 'long',
    regime: row.regime,
    score: row.score,
    quality: row.quality,
    entryAt: row.entryAt.toISOString(),
    entryPrice: row.entryPrice,
    exitAt: row.exitAt.toISOString(),
    exitPrice: row.exitPrice,
    exitReason: row.exitReason,
    grossPaise: row.grossPaise,
    costPaise: row.costPaise,
    netPaise: row.netPaise,
    rMultiple: row.rMultiple,
    maxFavourable: row.maxFavourable,
    maxAdverse: row.maxAdverse,
    barsHeld: row.barsHeld,
  }));

  // `unresolved` outcomes are excluded from every statistic, exactly as the
  // live page excludes still-open trades: an outcome that never completed has
  // no result, and folding it into a hit rate invents one.
  const resolved = rows.filter((row) => row.exitReason !== 'unresolved');
  const stats = summarisePaperTrades(resolved.map(asPaperTrade));
  const loss = Math.abs(stats.averageLossR);

  const rejectionCounts = readRejections(stored.rejections);
  const rejectionTotal = rejectionCounts.reduce((sum, entry) => sum + entry[1], 0);

  return {
    configured: true,
    run,
    results: {
      configured: true,
      trades: rows,
      sessions: new Set(rows.map((row) => row.tradingDate)).size,
      open: rows.length - resolved.length,
      summary: {
        trades: stats.trades,
        wins: stats.wins,
        losses: stats.losses,
        hitRate: stats.hitRate,
        expectancyR: stats.expectancyR,
        profitFactor: stats.profitFactor,
        averageWinR: stats.averageWinR,
        averageLossR: stats.averageLossR,
        averageBarsHeld: stats.averageBarsHeld,
        breakevenHitRate:
          stats.averageWinR <= 0 || loss === 0 ? null : loss / (stats.averageWinR + loss),
      },
      byScore: group(resolved, (row) => scoreBand(row.score)).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      byStrategy: group(resolved, (row) => row.strategy),
      byExit: group(resolved, (row) => row.exitReason),
      byRegime: group(resolved, (row) => row.regime),
      byDirection: group(resolved, (row) => row.direction),
      // Chronological, not by size: this series is read as a timeline.
      bySession: group(resolved, (row) => row.tradingDate).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      // Standard error of a proportion at p = 0.5, the widest case, doubled for
      // a roughly 95% interval. Deliberately the pessimistic form: it exists to
      // restrain conclusions, not to flatter them.
      marginOfErrorPoints: stats.trades === 0 ? null : 100 / Math.sqrt(stats.trades),
    },
    rejections: rejectionCounts.slice(0, 15).map(([reason, count]) => ({
      reason,
      count,
      share: rejectionTotal === 0 ? 0 : count / rejectionTotal,
    })),
    rejectionTotal,
  };
}

function readRejections(raw: unknown): [string, number][] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort((a, b) => b[1] - a[1]);
}
