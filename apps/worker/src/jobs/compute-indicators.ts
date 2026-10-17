import { atr, type Bar, ema, macd, rsi, sma } from '@equitywise/core';
import {
  getDailyBars,
  getLatestDailyCandleTime,
  type IndicatorUpsert,
  listActiveInstruments,
  upsertDailyIndicators,
} from '@equitywise/db';
import { istDateKey } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import { checkSessionIngested, withIngestionRun } from '../ingestion-tracking.js';
import { errorFields, type Logger } from '../log.js';

/**
 * End-of-day indicator pass.
 *
 * Reads CLOSED daily candles from the database — adjusted for corporate
 * actions on the way out — runs the pure indicators over them, and stores one
 * indicator row per instrument (for the watchlists, screener and alerts).
 *
 * No network calls: everything here comes from what ingestion already stored.
 * That is what makes it cheap enough to re-run after an engine fix.
 */

/** Below this, indicators are too warm-up-contaminated to store at all. */
const MIN_BARS = 60;

/** Sessions in a rolling year, for the 52-week extremes. */
const SESSIONS_52W = 250;

/** Bars pulled per instrument. Enough for a 200-EMA plus a year of extremes. */
const LOOKBACK_BARS = 400;

/** Indicator parameters. The stored column names (`rsi14`, `atr14`) depend on them. */
const MACD_PERIODS = { fast: 12, slow: 26, signal: 9 } as const;
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
/** Prior sessions in the average-volume baseline. */
const VOLUME_LOOKBACK = 20;

export interface IndicatorPassResult {
  readonly requested: number;
  readonly computed: number;
  readonly skipped: string[];
  readonly tradingDate: string | null;
}

export async function computeIndicators(
  context: WorkerContext,
  log: Logger,
  options: { now?: Date } = {},
): Promise<IndicatorPassResult> {
  const now = options.now ?? new Date();
  const pass = await withIngestionRun(
    context.db,
    log,
    { job: 'indicators', tradingDate: istDateKey(now) },
    async () => {
      const result = await runIndicatorPass(context, log, now);
      return {
        ...result,
        succeeded: result.computed,
        rowsWritten: result.computed,
        failed: [] as string[],
      };
    },
  );
  const { succeeded: _s, rowsWritten: _r, failed: _f, ...result } = pass;
  return result;
}

async function runIndicatorPass(
  context: WorkerContext,
  log: Logger,
  now: Date,
): Promise<IndicatorPassResult> {
  const { db } = context;

  // Indicators computed across a session that was never loaded look plausible and
  // are wrong, so ask the ingestion bookkeeping first. Before anything is written.
  const newest = await getLatestDailyCandleTime(db);
  if (newest !== null) await checkSessionIngested(db, log, istDateKey(newest));

  const active = await listActiveInstruments(db, 'equity');
  log.info('starting', { instruments: active.length });

  const rows: IndicatorUpsert[] = [];
  const skipped: string[] = [];
  let latestDate: string | null = null;

  for (const instrument of active) {
    try {
      const bars = await getDailyBars(db, {
        instrumentId: instrument.id,
        from: new Date(0),
        to: now,
        limit: LOOKBACK_BARS,
      });

      if (bars.length < MIN_BARS) {
        skipped.push(instrument.symbol);
        continue;
      }

      const last = bars.at(-1);
      if (last === undefined) {
        skipped.push(instrument.symbol);
        continue;
      }

      const tradingDate = istDateKey(new Date(last.timestamp));
      if (latestDate === null || tradingDate > latestDate) latestDate = tradingDate;

      rows.push(buildIndicatorRow(instrument.id, tradingDate, bars));
    } catch (error) {
      skipped.push(instrument.symbol);
      log.warn('instrument failed', { symbol: instrument.symbol, ...errorFields(error) });
    }
  }

  const computed = await upsertDailyIndicators(db, rows);
  log.info('finished', {
    requested: active.length,
    computed,
    skipped: skipped.length,
    tradingDate: latestDate,
  });

  return {
    requested: active.length,
    computed,
    skipped,
    tradingDate: latestDate,
  };
}

/** Rounds a paise-valued indicator, keeping null as null rather than 0. */
function paise(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function buildIndicatorRow(
  instrumentId: number,
  tradingDate: string,
  bars: readonly Bar[],
): IndicatorUpsert {
  const closes = bars.map((bar) => bar.close);
  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  if (last === undefined) throw new Error('buildIndicatorRow: empty bar series');

  const macdResult = macd(closes, MACD_PERIODS);

  // The volume average deliberately EXCLUDES the current session — comparing
  // today's volume to an average that already contains it damps exactly the
  // spike relative volume exists to detect.
  const lookback = Math.min(VOLUME_LOOKBACK, bars.length - 1);
  const priorVolumes = bars.slice(-1 - lookback, -1).map((bar) => bar.volume);
  const averageVolume =
    priorVolumes.length === 0
      ? null
      : Math.round(priorVolumes.reduce((sum, v) => sum + v, 0) / priorVolumes.length);

  const yearBars = bars.slice(-SESSIONS_52W);

  return {
    instrumentId,
    tradingDate,
    close: last.close,
    high: last.high,
    low: last.low,
    volume: last.volume,
    ema20: paise(latestOf(ema(closes, 20))),
    ema50: paise(latestOf(ema(closes, 50))),
    ema200: paise(latestOf(ema(closes, 200))),
    sma20: paise(latestOf(sma(closes, 20))),
    sma50: paise(latestOf(sma(closes, 50))),
    rsi14: latestOf(rsi(closes, RSI_PERIOD)),
    macd: paise(latestOf(macdResult.macd)),
    macdSignal: paise(latestOf(macdResult.signal)),
    macdHistogram: paise(latestOf(macdResult.histogram)),
    atr14: paise(latestOf(atr(bars, ATR_PERIOD))),
    averageVolume,
    relativeVolume:
      averageVolume === null || averageVolume === 0 ? null : last.volume / averageVolume,
    high52w: yearBars.length === 0 ? null : Math.max(...yearBars.map((bar) => bar.high)),
    low52w: yearBars.length === 0 ? null : Math.min(...yearBars.map((bar) => bar.low)),
    changePercent:
      previous === undefined || previous.close === 0
        ? null
        : ((last.close - previous.close) / previous.close) * 100,
    barCount: bars.length,
  };
}

/** Last non-null value of a series, or null if it never warmed up. */
function latestOf(series: readonly (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}
