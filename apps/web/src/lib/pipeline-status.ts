import type { IntradayRunDto } from './intraday-types';
import type { MarketStateDto } from './market-types';

/**
 * Turns the feed's own facts — market state, the last worker run, and the
 * staleness the server already computed — into one "is this thing actually
 * scanning?" verdict for the header badge, in plain language.
 *
 * Deliberately reads nothing that is not already on `IntradayFeedDto`. There
 * is exactly one engine (`packages/core/src/intraday`: strategies, the
 * confluence scorer and the lifecycle machine run together as one pass per
 * `apps/worker` cycle — CLAUDE.md), so there is exactly one health signal for
 * it: the `intraday_runs` row. A UI that invented a separate "pattern
 * scanner" or "scripts" light next to it would be showing five colours for
 * one fact.
 */

export type PipelineState =
  | 'live'
  | 'processing'
  | 'starting'
  | 'delayed'
  | 'stopped'
  | 'error'
  | 'unknown'
  | 'closed';

export type PipelineTone = 'positive' | 'caution' | 'critical' | 'neutral';

export interface PipelineStatus {
  readonly state: PipelineState;
  readonly tone: PipelineTone;
  readonly label: string;
  readonly detail: string;
  /** ISO timestamp of the last run activity the engine reported, if any. */
  readonly lastActivityAt: string | null;
  /** The exchange, independently of the engine — 'unknown' when the status check itself failed. */
  readonly market: 'open' | 'closed' | 'unknown';
  /** Whether the last run actually saw prices, distinct from whether it "ran". */
  readonly marketData: 'receiving' | 'no_data' | 'unknown';
}

/**
 * A second, much longer threshold than the feed's own `stale` flag (12
 * minutes — four missed 3-minute cycles). Past this, "delayed" stops being a
 * fair reading and the honest word is "stopped": ten missed default cycles is
 * not a slow pass, it is a worker that is not running.
 */
export const STOPPED_AFTER_MS = 30 * 60_000;

/**
 * How long an in-flight cycle (`finishedAt: null`) is treated as normal
 * "scanning now" before it is flagged as taking too long.
 *
 * A real cycle finishes in seconds to low tens of seconds — one observed run
 * took 18s end to end. A cycle still open after several minutes is not a slow
 * pass, it is very likely wedged on a hung network call, and the badge should
 * say so rather than reading "Scanning" for up to 30 minutes straight.
 */
export const PROCESSING_GRACE_MS = 3 * 60_000;

function marketDataStatus(run: IntradayRunDto | null): PipelineStatus['marketData'] {
  if (run === null) return 'unknown';
  if (run.symbolsRequested > 0 && run.symbolsEvaluated === 0) return 'no_data';
  if (run.symbolsEvaluated > 0) return 'receiving';
  return 'unknown';
}

export function derivePipelineStatus(input: {
  readonly market: MarketStateDto;
  readonly run: IntradayRunDto | null;
  readonly stale: boolean;
  readonly now: number;
}): PipelineStatus {
  const { market, run, stale, now } = input;
  const marketData = marketDataStatus(run);
  const lastActivityAt = run?.finishedAt ?? run?.startedAt ?? null;

  // The status LOOKUP failed (not "the exchange said closed") — a materially
  // different fact from either open or closed, and the one case where saying
  // "Market closed" would be an outright lie rather than just imprecise.
  if (market.phase === 'unknown') {
    return {
      state: 'unknown',
      tone: 'critical',
      label: 'Status unknown',
      detail: "Can't confirm whether the market is open — the market-data connection may be down.",
      lastActivityAt,
      market: 'unknown',
      marketData,
    };
  }

  const marketState: PipelineStatus['market'] = market.isOpen ? 'open' : 'closed';

  if (!market.isOpen) {
    return {
      state: 'closed',
      tone: 'neutral',
      label: 'Market closed',
      detail:
        market.phase === 'pre_open'
          ? 'Opens at 9:15 AM IST — scanning starts then.'
          : 'Scanning resumes at the next session.',
      lastActivityAt,
      market: marketState,
      marketData,
    };
  }

  if (run === null) {
    return {
      state: 'starting',
      tone: 'caution',
      label: 'Starting up',
      detail: 'The market session has started and the engine is getting ready to scan.',
      lastActivityAt: null,
      market: marketState,
      marketData,
    };
  }

  if (run.status === 'failed' || run.error !== null) {
    return {
      state: 'error',
      tone: 'critical',
      label: 'Scan error',
      detail: run.error ?? 'The last scan failed.',
      lastActivityAt: run.finishedAt ?? run.startedAt,
      market: marketState,
      marketData,
    };
  }

  const activityAt = run.finishedAt ?? run.startedAt;
  const ageMs = Math.max(0, now - new Date(activityAt).getTime());
  const inFlight = run.finishedAt === null;

  if (inFlight && ageMs <= PROCESSING_GRACE_MS) {
    return {
      state: 'processing',
      tone: 'caution',
      label: 'Scanning now',
      detail: "Running this cycle's scan right now.",
      lastActivityAt: activityAt,
      market: marketState,
      marketData,
    };
  }

  if (ageMs > STOPPED_AFTER_MS) {
    return {
      state: 'stopped',
      tone: 'critical',
      label: 'Not scanning',
      detail: `No completed scan in over ${Math.floor(STOPPED_AFTER_MS / 60_000)} minutes — the worker has likely stopped.`,
      lastActivityAt: activityAt,
      market: marketState,
      marketData,
    };
  }

  if (stale || inFlight) {
    return {
      state: 'delayed',
      tone: 'caution',
      label: 'Scan delayed',
      detail: inFlight
        ? 'The current scan is taking longer than usual — it may be stuck.'
        : 'The engine may be running, but has not completed a scan recently.',
      lastActivityAt: activityAt,
      market: marketState,
      marketData,
    };
  }

  return {
    state: 'live',
    tone: 'positive',
    label: 'Scanning live',
    detail: 'Market is open and the engine is actively scanning for setups.',
    lastActivityAt: activityAt,
    market: marketState,
    marketData,
  };
}
