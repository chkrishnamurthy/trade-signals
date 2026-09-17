import {
  formatPaise,
  type IntradayCheck,
  type IntradayDirection,
  type IntradayEvidence,
  type IntradayRejectReason,
  istDateKey,
  istMinutesOfDay,
  sessionOpen,
} from '@equitywise/shared';
import { vwap } from '../indicators/index.js';
import type { Bar } from '../types.js';
import { bodyRatio, coherentSignalBars, relativeVolume } from './bars.js';
import { ORB_CONFIG, type OrbConfig } from './config.js';
import { openingRange, orbLevels } from './orb.js';
import { type SessionEligibilityInput, sessionEligibility } from './session.js';

/**
 * The ORB-VC decision for ONE stock at ONE instant. Pure: bars + config in,
 * a signal or a reason out. The worker calls it once per closed candle; the
 * replay script calls it with the same bars and gets the same answer.
 *
 * `bars` are closed five-minute candles, ascending, spanning enough prior
 * sessions for warm-up. The decision bar is the last one that closed at or
 * before `asOf`; nothing after it is read (hard rule 2). The tradeable entry is
 * the NEXT candle's open, simulated by the lifecycle from a later observation.
 */
export interface OrbInput {
  bars: readonly Bar[];
  asOf: number;
  tickSize: number;
  alreadySignalled: boolean;
  session: Omit<SessionEligibilityInput, 'todayOpen' | 'config'>;
  config?: OrbConfig;
}
export type OrbDecision =
  | { kind: 'SIGNAL'; evidence: IntradayEvidence; checks: IntradayCheck[] }
  | { kind: 'REJECT'; reason: IntradayRejectReason; checks: IntradayCheck[] };

const pct = (x: number) => `${x.toFixed(2)}%`;
const bps = (x: number) => `${x.toFixed(1)} bps`;

export function evaluateOrb(input: OrbInput): OrbDecision {
  const config = input.config ?? ORB_CONFIG;
  const checks: IntradayCheck[] = [];
  const reject = (reason: IntradayRejectReason): OrbDecision => ({
    kind: 'REJECT',
    reason,
    checks,
  });
  const check = (
    id: string,
    label: string,
    passed: boolean,
    required: string,
    actual: string,
  ): boolean => {
    checks.push({ id, label, passed, required, actual });
    return passed;
  };

  // Only bars closed by asOf exist for this decision. Truncating here is what
  // makes "append a future bar" provably unable to change today's answer.
  const bars = input.bars.filter((b) => b.timestamp + config.barMs <= input.asOf);
  const decisionIndex = bars.length - 1;
  const c = bars[decisionIndex];
  if (!c) return reject('NO_BARS');
  if (!coherentSignalBars(bars, input.asOf)) return reject('INCOHERENT_BARS');
  if (decisionIndex < config.warmupBars) return reject('WARMUP');
  if (!Number.isSafeInteger(input.tickSize) || input.tickSize <= 0)
    return reject('INCOHERENT_BARS');

  const sessionDate = istDateKey(new Date(c.timestamp));
  const closeAt = c.timestamp + config.barMs;
  const closeMinute = istMinutesOfDay(new Date(closeAt));
  if (
    sessionDate !== istDateKey(new Date(input.asOf)) ||
    closeMinute < config.firstSignalCloseMinute ||
    closeMinute > config.lastSignalCloseMinute
  )
    return reject('OUTSIDE_WINDOW');
  if (input.asOf - closeAt > config.maxPublicationDelayMs) return reject('LATE');
  if (input.alreadySignalled) return reject('ALREADY_SIGNALLED');

  const open = sessionOpen(new Date(c.timestamp)).getTime();
  const todayStart = bars.findIndex((b) => b.timestamp >= open);
  const today = bars.slice(todayStart);
  const first = today[0];
  if (!first) return reject('NO_BARS');
  const session = sessionEligibility({ ...input.session, todayOpen: first.open, config });
  if (session.reason) return reject(session.reason);

  const range = openingRange(today, open, config);
  if (!range) return reject('OR_INCOMPLETE');
  if (
    !check(
      'or_range',
      'Opening range width',
      range.rangeBps >= config.minOrBps && range.rangeBps <= config.maxOrBps,
      `${config.minOrBps}–${config.maxOrBps} bps of midpoint`,
      bps(range.rangeBps),
    )
  )
    return reject('OR_RANGE');

  const rvol = relativeVolume(bars, decisionIndex, config.volumeLookbackBars);
  if (rvol === null) return reject('VOLUME_UNAVAILABLE');
  if (
    !check(
      'volume',
      'Candle volume vs recent average',
      rvol >= config.minRelativeVolume,
      `≥ ${config.minRelativeVolume}× the previous ${config.volumeLookbackBars} candles`,
      `${rvol.toFixed(2)}×`,
    )
  )
    return reject('VOLUME');

  const body = bodyRatio(c);
  if (
    !check(
      'body',
      'Candle body',
      body !== null && body >= config.minBodyRatio,
      `≥ ${pct(config.minBodyRatio * 100)} of its range`,
      body === null ? 'zero range' : pct(body * 100),
    ) ||
    body === null
  )
    return reject('BODY');

  const sessionVwap = vwap(today)[today.length - 1] ?? null;
  const direction: IntradayDirection | null =
    sessionVwap === null
      ? null
      : c.close > range.high && c.close > sessionVwap
        ? 'BUY'
        : c.close < range.low && c.close < sessionVwap
          ? 'SELL'
          : null;
  check(
    'breakout',
    'Close outside the opening range, on VWAP’s side',
    direction !== null,
    `close > ${formatPaise(range.high)} and > VWAP, or close < ${formatPaise(range.low)} and < VWAP`,
    `close ${formatPaise(c.close)}, VWAP ${sessionVwap === null ? 'unavailable' : formatPaise(sessionVwap)}`,
  );
  if (direction === null || sessionVwap === null) return reject('NO_BREAKOUT');

  const edge = direction === 'BUY' ? range.high : range.low;
  const extensionBps = (Math.abs(c.close - edge) * 10_000) / edge;
  if (
    !check(
      'extension',
      'Not already extended past the range',
      extensionBps <= config.maxExtensionBps,
      `≤ ${config.maxExtensionBps} bps beyond the range edge`,
      bps(extensionBps),
    )
  )
    return reject('EXTENDED');

  const levels = orbLevels(c.close, range, direction, input.tickSize, config);
  if (
    !check(
      'risk',
      'Risk distance within limits',
      levels !== null,
      `${config.minRiskBps / 100}–${config.maxRiskBps / 100}% of the signal close`,
      levels === null ? 'too wide' : pct((levels.riskDistance * 100) / c.close),
    ) ||
    levels === null
  )
    return reject('STOP_TOO_WIDE');

  return {
    kind: 'SIGNAL',
    checks,
    evidence: {
      strategyName: config.name,
      strategyRevision: config.revision,
      direction,
      sessionDate,
      candle: c,
      signalAt: closeAt,
      openingRange: range,
      vwap: sessionVwap,
      relativeVolume: rvol,
      bodyRatio: body,
      extensionBps,
      levels,
      checks,
    },
  };
}
