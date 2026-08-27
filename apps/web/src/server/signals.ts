import 'server-only';
import {
  DEFAULT_STRATEGY,
  evaluateSignals,
  type IndicatorSnapshot,
  scanSwing,
} from '@equitywise/core';
import { istDateKey } from '@equitywise/shared';
import type {
  ActivityEventDto,
  SignalsDto,
  StockSignalDto,
  SwingCandidateDto,
} from '@/lib/dashboard-types';
import { invalidateDashboard } from './dashboard';
import { toMarketError } from './errors';
import { dailyRange, getBars } from './history';
import { getHeadlineIndices, getIndex, type ResolvedIndex } from './indices';

/**
 * Technical indicators and signals for an index's constituents.
 *
 * This is the expensive half of the dashboard. History APIs serve one symbol
 * per call, so a 50-stock index costs 50 requests — roughly a quarter of the
 * entire per-minute budget. Two things keep it affordable:
 *
 *   1. Daily candles change once a day, and the engine only consumes CLOSED
 *      candles (CLAUDE.md hard rule 2), so a result stays valid all session.
 *   2. Results are cached by trading date and shared by every caller.
 *
 * The dashboard never triggers this; it reads whatever the cache already holds
 * and reports `indicatorsReady: false` until a run completes.
 */

/** Calendar days of daily history to pull. ~1 year of sessions plus slack. */
const HISTORY_DAYS = 400;

/** Enough bars for a 200-EMA to mean anything. */
const MIN_BARS_FOR_EMA200 = 200;

export interface IndicatorCache {
  readonly snapshots: Map<string, IndicatorSnapshot>;
  readonly sparklines: Map<string, number[]>;
  readonly aboveEma20: number;
  readonly aboveEma50: number;
  readonly aboveEma200: number;
  readonly computedAt: string;
  readonly tradingDate: string;
}

const indicatorCache = new Map<string, IndicatorCache>();
const signalsCache = new Map<string, { dto: SignalsDto; tradingDate: string; at: number }>();
const inFlight = new Map<string, Promise<SignalsDto>>();

/** Synchronous read — used by the dashboard, which must never block on this. */
export function getIndicatorCache(indexKey: string): IndicatorCache | null {
  return indicatorCache.get(indexKey.toLowerCase()) ?? null;
}

/** Signals recompute when the trading date rolls over, or after this long. */
const SIGNALS_TTL_MS = 15 * 60_000;

async function build(index: ResolvedIndex, now: Date): Promise<SignalsDto> {
  const range = dailyRange(HISTORY_DAYS, now);

  const snapshots = new Map<string, IndicatorSnapshot>();
  const signals: StockSignalDto[] = [];
  const swing: SwingCandidateDto[] = [];
  const activity: ActivityEventDto[] = [];
  const skipped: string[] = [];

  let aboveEma20 = 0;
  let aboveEma50 = 0;
  let aboveEma200 = 0;

  for (const constituent of index.constituents) {
    let bars: Awaited<ReturnType<typeof getBars>>;
    try {
      bars = await getBars(
        { ref: constituent, resolution: '1d', from: range.from, to: range.to },
        now,
      );
    } catch {
      // One dead symbol must not cost us the other 49.
      skipped.push(constituent.symbol);
      continue;
    }

    if (bars.length < 30) {
      skipped.push(constituent.symbol);
      continue;
    }

    const report = evaluateSignals(bars, DEFAULT_STRATEGY);
    if (report.insufficientData) {
      skipped.push(constituent.symbol);
      continue;
    }

    const ind = report.indicators;
    snapshots.set(constituent.symbol, ind);

    if (ind.ema20 !== null && ind.close > ind.ema20) aboveEma20 += 1;
    if (ind.ema50 !== null && ind.close > ind.ema50) aboveEma50 += 1;
    if (bars.length >= MIN_BARS_FOR_EMA200 && ind.ema200 !== null && ind.close > ind.ema200) {
      aboveEma200 += 1;
    }

    const lastBar = bars.at(-1);
    const prevBar = bars.at(-2);
    const changePercent =
      lastBar !== undefined && prevBar !== undefined && prevBar.close !== 0
        ? ((lastBar.close - prevBar.close) / prevBar.close) * 100
        : null;

    signals.push({
      symbol: constituent.symbol,
      name: constituent.name,
      sector: constituent.sector,
      ltp: ind.close,
      changePercent,
      direction: report.direction,
      strength: report.strength,
      setups: report.setups,
      factors: report.factors.map((f) => ({
        key: f.key,
        label: f.label,
        score: f.score,
        weight: f.weight,
        detail: f.detail,
      })),
      rsi: ind.rsi,
      ema20: ind.ema20,
      ema50: ind.ema50,
      ema200: ind.ema200,
      macdHistogram: ind.macdHistogram,
      atr: ind.atr,
      relativeVolume: ind.relativeVolume,
      high52w: ind.high52w,
      low52w: ind.low52w,
    });

    const candidate = scanSwing(bars, DEFAULT_STRATEGY);
    if (candidate.qualifies) {
      swing.push({
        symbol: constituent.symbol,
        name: constituent.name,
        sector: constituent.sector,
        setup: candidate.setupName,
        ltp: ind.close,
        changePercent,
        strength: report.strength,
        direction: report.direction,
        rsi: ind.rsi,
        relativeVolume: ind.relativeVolume,
        met: candidate.met,
        total: candidate.total,
        criteria: candidate.criteria.map((c) => ({
          label: c.label,
          met: c.met,
          detail: c.detail,
        })),
      });
    }

    // Activity is derived strictly from detected setups — never invented.
    const at =
      lastBar === undefined ? now.toISOString() : new Date(lastBar.timestamp).toISOString();
    for (const setup of report.setups) {
      const tone = toneFor(setup);
      if (tone === null) continue;
      activity.push({ at, symbol: constituent.symbol, message: `${setup} detected`, tone });
    }
  }

  // Sparklines for the headline indices only — four extra calls, not fifty.
  const sparklines = new Map<string, number[]>();
  for (const headline of await getHeadlineIndices()) {
    try {
      const bars = await getBars(
        {
          ref: headline,
          resolution: '1d',
          from: new Date(now.getTime() - 45 * 86_400_000),
          to: now,
        },
        now,
      );
      sparklines.set(
        headline.symbol,
        bars.slice(-30).map((b) => b.close),
      );
    } catch {
      // A missing sparkline is cosmetic; never fail the whole pass for it.
    }
  }

  indicatorCache.set(index.key, {
    snapshots,
    sparklines,
    aboveEma20,
    aboveEma50,
    aboveEma200,
    computedAt: now.toISOString(),
    tradingDate: istDateKey(now),
  });

  // The cached dashboard snapshot predates these indicators; drop it so the
  // next poll picks them up instead of waiting out its TTL.
  invalidateDashboard(index.key);

  return {
    signals: signals.sort((a, b) => b.strength - a.strength),
    swing: swing.sort((a, b) => b.strength - a.strength),
    activity: activity.slice(0, 40),
    breadthExtras: { aboveEma20, aboveEma50, aboveEma200, total: snapshots.size },
    computedAt: now.toISOString(),
    skipped,
  };
}

function toneFor(setup: string): ActivityEventDto['tone'] | null {
  const bullish = [
    'Breakout',
    'MACD bullish crossover',
    'Golden cross alignment',
    'Volume breakout',
    'Higher-high structure',
  ];
  const bearish = [
    'Breakdown',
    'MACD bearish crossover',
    'Death cross alignment',
    'High-volume selling',
    'Lower-low structure',
  ];
  if (bullish.includes(setup)) return 'bullish';
  if (bearish.includes(setup)) return 'bearish';
  return null;
}

export async function getSignals(indexKey: string, now = new Date()): Promise<SignalsDto> {
  const index = await getIndex(indexKey);
  if (index === null) {
    throw toMarketError(new Error(`Unknown index "${indexKey}"`));
  }

  const today = istDateKey(now);
  const cached = signalsCache.get(index.key);
  if (
    cached !== undefined &&
    cached.tradingDate === today &&
    now.getTime() - cached.at < SIGNALS_TTL_MS
  ) {
    return cached.dto;
  }

  const existing = inFlight.get(index.key);
  if (existing !== undefined) return existing;

  const pending = build(index, now)
    .then((dto) => {
      signalsCache.set(index.key, { dto, tradingDate: today, at: now.getTime() });
      return dto;
    })
    .catch((error: unknown) => {
      throw toMarketError(error);
    })
    .finally(() => {
      inFlight.delete(index.key);
    });

  inFlight.set(index.key, pending);
  return pending;
}
