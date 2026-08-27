import 'server-only';
import { type PaperTrade, summarisePaperTrades } from '@equitywise/core';
import { getPaperTrades } from '@equitywise/db';
import { getDatabase, isDatabaseConfigured } from './db';

/**
 * The paper-trading results feed.
 *
 * Reads only. Outcomes are recorded by `apps/worker` from `resolvePaperTrade`;
 * this layer re-summarises them but never re-resolves one, so the page cannot
 * disagree with what was measured at the time.
 *
 * Every figure is per share and NO MONEY IS REPRESENTED. This is a measurement
 * of the engine's signals against the tape — not a trading record, not a
 * portfolio, and not a claim about what the user would have made.
 */

export interface PaperTradeRow {
  readonly id: string;
  readonly signalId: string;
  readonly symbol: string;
  readonly tradingDate: string;
  readonly kind: string;
  readonly strategy: string;
  readonly direction: 'long' | 'short';
  readonly regime: string;
  readonly score: number;
  readonly quality: string;
  readonly entryAt: string;
  readonly entryPrice: number;
  readonly exitAt: string;
  readonly exitPrice: number;
  readonly exitReason: string;
  readonly grossPaise: number;
  readonly costPaise: number;
  readonly netPaise: number;
  readonly rMultiple: number;
  readonly maxFavourable: number;
  readonly maxAdverse: number;
  readonly barsHeld: number;
}

export interface PaperBucket {
  readonly label: string;
  readonly trades: number;
  readonly hitRate: number;
  readonly expectancyR: number;
  readonly profitFactor: number | null;
}

export interface PaperResultsDto {
  readonly configured: boolean;
  readonly trades: readonly PaperTradeRow[];
  readonly sessions: number;
  readonly open: number;
  readonly summary: {
    readonly trades: number;
    readonly wins: number;
    readonly losses: number;
    readonly hitRate: number;
    readonly expectancyR: number;
    readonly profitFactor: number | null;
    readonly averageWinR: number;
    readonly averageLossR: number;
    readonly averageBarsHeld: number;
    /** The hit rate this win/loss geometry needs merely to break even. */
    readonly breakevenHitRate: number | null;
  };
  readonly byScore: readonly PaperBucket[];
  readonly byStrategy: readonly PaperBucket[];
  readonly byExit: readonly PaperBucket[];
  /** Which part of the session the signal triggered in. */
  readonly byRegime: readonly PaperBucket[];
  /** Long versus short. */
  readonly byDirection: readonly PaperBucket[];
  /**
   * One bucket per trading session, oldest first.
   *
   * Summarised here rather than in the browser so a session's expectancy is
   * produced by the same `bucket()` as every other figure on the page. A
   * component computing its own mean would eventually disagree with the
   * headline number, and the page's whole purpose is to be trustworthy.
   */
  readonly bySession: readonly PaperBucket[];
  /**
   * Margin of error on the hit rate, in percentage points.
   *
   * Published beside every figure because the alternative — a bare "62% hit
   * rate" over nineteen trades — is the single most misleading thing this page
   * could show.
   */
  readonly marginOfErrorPoints: number | null;
}

const EMPTY: PaperResultsDto = {
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

export async function getPaperResults(): Promise<PaperResultsDto> {
  if (!isDatabaseConfigured()) return EMPTY;

  const stored = await getPaperTrades(getDatabase(), { limit: 2_000 });
  const rows: PaperTradeRow[] = stored.map((row) => ({
    id: String(row.id),
    signalId: String(row.signalId),
    symbol: row.symbol,
    tradingDate: row.tradingDate,
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

  // Trades still running are shown but never counted: an open position has no
  // outcome, and folding it into a hit rate invents one.
  const resolved = rows.filter((row) => row.exitReason !== 'unresolved');
  const stats = summarisePaperTrades(resolved.map(asPaperTrade));
  const loss = Math.abs(stats.averageLossR);

  return {
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
    // a roughly 95% interval. Deliberately the pessimistic form: this number
    // exists to restrain conclusions, not to flatter them.
    marginOfErrorPoints: stats.trades === 0 ? null : 100 / Math.sqrt(stats.trades),
  };
}
