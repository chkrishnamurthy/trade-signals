import type { Bar, InstrumentRef, MarketDataProvider, Resolution } from '@equitywise/market-data';
import {
  istDateKey,
  isWeekend,
  sessionClose,
  sessionOpen,
  startOfIstDay,
} from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';
import { loadIndexConstituents } from '../universe.js';

/**
 * Bar cross-check: the same instruments, resolutions and range from two
 * providers, compared bar by bar in paise.
 *
 * This is the evidence behind a cut-over. A provider's bars are only worth
 * routing to if they agree with the incumbent's — a systematic offset (a
 * different close convention, a missing final minute, an unadjusted split)
 * would silently change every indicator the watchlist shows. The report is
 * quantified rather than pass/fail: the operator reads the numbers and
 * decides. Nothing here writes to the database.
 */

export interface BarMismatch {
  readonly timestamp: number;
  readonly field: 'open' | 'high' | 'low' | 'close' | 'volume';
  readonly a: number;
  readonly b: number;
  /** `b − a`; paise for prices, shares for volume. */
  readonly delta: number;
}

export interface BarComparison {
  /** Bars stamped identically on both sides. */
  readonly compared: number;
  /** Compared bars where any field differs. */
  readonly mismatched: number;
  /** Largest absolute price difference among compared bars, paise. */
  readonly maxPriceDeltaPaise: number;
  /** Compared bars whose volume differs. */
  readonly volumeMismatches: number;
  /** Timestamps only one side has. */
  readonly onlyA: readonly number[];
  readonly onlyB: readonly number[];
  /** The first few disagreements, for the log. */
  readonly sample: readonly BarMismatch[];
}

const PRICE_FIELDS = ['open', 'high', 'low', 'close'] as const;
const SAMPLE_SIZE = 5;

/** Pure: compares two bar series stamped on the same convention. */
export function compareBars(a: readonly Bar[], b: readonly Bar[]): BarComparison {
  const byTimestampB = new Map(b.map((bar) => [bar.timestamp, bar]));
  const seen = new Set<number>();
  const onlyA: number[] = [];
  const sample: BarMismatch[] = [];
  let compared = 0;
  let mismatched = 0;
  let maxPriceDeltaPaise = 0;
  let volumeMismatches = 0;

  for (const barA of a) {
    const barB = byTimestampB.get(barA.timestamp);
    if (barB === undefined) {
      onlyA.push(barA.timestamp);
      continue;
    }
    seen.add(barA.timestamp);
    compared += 1;

    let differs = false;
    for (const field of PRICE_FIELDS) {
      const delta = barB[field] - barA[field];
      if (delta === 0) continue;
      differs = true;
      maxPriceDeltaPaise = Math.max(maxPriceDeltaPaise, Math.abs(delta));
      if (sample.length < SAMPLE_SIZE)
        sample.push({ timestamp: barA.timestamp, field, a: barA[field], b: barB[field], delta });
    }
    if (barB.volume !== barA.volume) {
      differs = true;
      volumeMismatches += 1;
      if (sample.length < SAMPLE_SIZE)
        sample.push({
          timestamp: barA.timestamp,
          field: 'volume',
          a: barA.volume,
          b: barB.volume,
          delta: barB.volume - barA.volume,
        });
    }
    if (differs) mismatched += 1;
  }

  const onlyB = b.map((bar) => bar.timestamp).filter((timestamp) => !seen.has(timestamp));
  return { compared, mismatched, maxPriceDeltaPaise, volumeMismatches, onlyA, onlyB, sample };
}

export interface CrossCheckEntry {
  readonly symbol: string;
  readonly kind: InstrumentRef['kind'];
  readonly resolution: Resolution;
  readonly barsA: number;
  readonly barsB: number;
  readonly comparison: BarComparison | null;
  /** Set when either fetch failed; the entry is then not comparable. */
  readonly error?: string;
}

export interface CrossCheckReport {
  readonly providerA: string;
  readonly providerB: string;
  readonly range: { readonly from: Date; readonly to: Date };
  readonly entries: readonly CrossCheckEntry[];
  readonly totals: {
    readonly compared: number;
    readonly mismatched: number;
    readonly onlyA: number;
    readonly onlyB: number;
    readonly maxPriceDeltaPaise: number;
    readonly failed: number;
  };
}

export interface CrossCheckOptions {
  readonly refs: readonly InstrumentRef[];
  readonly resolutions: readonly Resolution[];
  readonly range: { readonly from: Date; readonly to: Date };
  readonly now: Date;
}

/**
 * Fetches and compares. Provider-neutral: takes two `MarketDataProvider`s and
 * never looks at which is which, so it can be pointed at any pair.
 */
export async function crossCheckBars(
  a: MarketDataProvider,
  b: MarketDataProvider,
  options: CrossCheckOptions,
  log?: Logger,
): Promise<CrossCheckReport> {
  const entries: CrossCheckEntry[] = [];
  const totals = {
    compared: 0,
    mismatched: 0,
    onlyA: 0,
    onlyB: 0,
    maxPriceDeltaPaise: 0,
    failed: 0,
  };

  for (const ref of options.refs) {
    for (const resolution of options.resolutions) {
      const request = { ref, resolution, range: options.range, now: options.now };
      try {
        // Sequential on purpose: both accounts have per-second budgets and the
        // point is a faithful comparison, not speed.
        const barsA = await a.fetchBars(request);
        const barsB = await b.fetchBars(request);
        const comparison = compareBars(barsA, barsB);
        entries.push({
          symbol: ref.symbol,
          kind: ref.kind,
          resolution,
          barsA: barsA.length,
          barsB: barsB.length,
          comparison,
        });
        totals.compared += comparison.compared;
        totals.mismatched += comparison.mismatched;
        totals.onlyA += comparison.onlyA.length;
        totals.onlyB += comparison.onlyB.length;
        totals.maxPriceDeltaPaise = Math.max(
          totals.maxPriceDeltaPaise,
          comparison.maxPriceDeltaPaise,
        );
        log?.info('compared', {
          symbol: ref.symbol,
          resolution,
          [a.id]: barsA.length,
          [b.id]: barsB.length,
          compared: comparison.compared,
          mismatched: comparison.mismatched,
          maxPriceDeltaPaise: comparison.maxPriceDeltaPaise,
          volumeMismatches: comparison.volumeMismatches,
          [`only_${a.id}`]: comparison.onlyA.length,
          [`only_${b.id}`]: comparison.onlyB.length,
          ...(comparison.sample.length === 0
            ? {}
            : {
                sample: comparison.sample.map((m) => ({
                  at: new Date(m.timestamp).toISOString(),
                  field: m.field,
                  [a.id]: m.a,
                  [b.id]: m.b,
                })),
              }),
        });
      } catch (error) {
        totals.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        entries.push({
          symbol: ref.symbol,
          kind: ref.kind,
          resolution,
          barsA: 0,
          barsB: 0,
          comparison: null,
          error: message,
        });
        log?.warn('comparison failed', { symbol: ref.symbol, resolution, ...errorFields(error) });
      }
    }
  }

  return { providerA: a.id, providerB: b.id, range: options.range, entries, totals };
}

export interface CrossCheckJobOptions {
  /** How many symbols from the index to sample. Default 10. */
  readonly sampleSize?: number;
  /** Trading sessions of 1-minute history to compare. Default 5. */
  readonly intradaySessions?: number;
  /** Calendar days of daily history to compare. Default 60. */
  readonly dailyDays?: number;
  readonly now?: Date;
}

/**
 * The scheduled shape: Fyers against Dhan for a sample of the NIFTY 50 plus
 * the index itself, over recent history. Skips with a warning when the worker
 * holds only one provider.
 */
export async function crossCheckProviders(
  context: WorkerContext,
  log: Logger,
  options: CrossCheckJobOptions = {},
): Promise<CrossCheckReport | null> {
  const fyers = context.providers.get('fyers');
  const dhan = context.providers.get('dhan');
  if (fyers === undefined || dhan === undefined) {
    log.warn('cross-check needs both providers configured', {
      held: [...context.providers.keys()],
      remedy: 'Set FYERS_APP_ID and DHAN_CLIENT_ID (with their credentials) on this worker.',
    });
    return null;
  }

  const now = options.now ?? new Date();
  const constituents = await loadIndexConstituents('nifty50');
  const refs: InstrumentRef[] = [
    { symbol: 'NIFTY50', kind: 'index' },
    ...constituents
      .slice(0, options.sampleSize ?? 10)
      .map((c) => ({ symbol: c.symbol, kind: c.kind })),
  ];

  // Ranges end at the last completed session close so neither side is asked
  // for a forming bar, and both are asked for exactly the same instants.
  const to = lastSessionClose(now);
  const dailyFrom = new Date(to.getTime() - (options.dailyDays ?? 60) * 86_400_000);
  const intradayFrom = sessionsBack(to, options.intradaySessions ?? 5);

  log.info('starting', {
    symbols: refs.length,
    daily: { from: istDateKey(dailyFrom), to: istDateKey(to) },
    intraday: { from: istDateKey(intradayFrom), to: istDateKey(to) },
  });

  const daily = await crossCheckBars(
    fyers,
    dhan,
    { refs, resolutions: ['1d'], range: { from: dailyFrom, to }, now },
    log,
  );
  const intraday = await crossCheckBars(
    fyers,
    dhan,
    { refs, resolutions: ['1m'], range: { from: intradayFrom, to }, now },
    log,
  );

  const report: CrossCheckReport = {
    providerA: daily.providerA,
    providerB: daily.providerB,
    range: { from: dailyFrom, to },
    entries: [...daily.entries, ...intraday.entries],
    totals: {
      compared: daily.totals.compared + intraday.totals.compared,
      mismatched: daily.totals.mismatched + intraday.totals.mismatched,
      onlyA: daily.totals.onlyA + intraday.totals.onlyA,
      onlyB: daily.totals.onlyB + intraday.totals.onlyB,
      maxPriceDeltaPaise: Math.max(
        daily.totals.maxPriceDeltaPaise,
        intraday.totals.maxPriceDeltaPaise,
      ),
      failed: daily.totals.failed + intraday.totals.failed,
    },
  };

  log.info('cross-check complete', {
    daily: daily.totals,
    intraday: intraday.totals,
    verdict:
      report.totals.mismatched === 0 && report.totals.failed === 0
        ? 'bars agree'
        : 'differences found; see entries above',
  });
  return report;
}

/** The instant just before midnight IST of the previous calendar day. */
function previousIstDay(date: Date): Date {
  return new Date(startOfIstDay(date).getTime() - 1);
}

/** 15:30 IST of the most recent weekday session that has already closed. */
export function lastSessionClose(now: Date): Date {
  let day = now;
  for (let i = 0; i < 7; i += 1) {
    const close = sessionClose(day);
    if (!isWeekend(close) && close.getTime() <= now.getTime()) return close;
    day = previousIstDay(day);
  }
  return sessionClose(now);
}

/** 09:15 IST of the session `count` weekday sessions back, counting `to`'s own as the first. */
export function sessionsBack(to: Date, count: number): Date {
  let day = to;
  let remaining = Math.max(count, 1);
  for (let i = 0; i < 31; i += 1) {
    if (!isWeekend(day)) {
      remaining -= 1;
      if (remaining === 0) return sessionOpen(day);
    }
    day = previousIstDay(day);
  }
  return sessionOpen(day);
}
