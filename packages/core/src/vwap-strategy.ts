import {
  istDateKey,
  istMinutesOfDay,
  type ScannerSnapshot,
  type SignalCondition,
  type SignalEvidence,
  type SignalFactor,
  STRATEGY_NAME,
  sessionOpen,
} from '@equitywise/shared';
import { adx, atr, ema, vwap } from './indicators/index.js';
import type { Bar } from './types.js';

export const VWAP_CONFIG = Object.freeze({
  name: STRATEGY_NAME,
  revision: 1,
  timeframe: '5m',
  warmup: 250,
  minAdx: 22,
  minRvol: 1.2,
  maxSpreadBps: 10,
  maxQuoteAgeMs: 15_000,
  maxPublicationDelayMs: 30_000,
  minScore: 70,
  maxDailySignals: 2,
  maxPullbackBars: 3,
  maxRiskAtr: 1.2,
  maxDistanceAtr: 2.5,
  pullbackTouchRatio: 0.0015,
  invalidationBufferAtr: 0.1,
  minBodyRatio: 0.5,
  minTurnoverPaise: 25_000_000_000,
  target1R: 1.5,
  target2R: 2,
  scoring: Object.freeze({
    trendBase: 20,
    trendBonus: 5,
    trendSlope: 0.0003,
    pullbackBase: 12,
    pullbackDepthBonus: 4,
    pullbackTouchBonus: 4,
    strongDepthAtr: 0.8,
    strongTouchRatio: 0.0005,
    confirmationBase: 10,
    confirmationBonus: 5,
    strongBodyRatio: 0.65,
    volumeBase: 8,
    volumeMedium: 12,
    volumeHigh: 15,
    mediumRvol: 1.5,
    highRvol: 2,
    benchmark: 10,
    adxBase: 5,
    adxMedium: 8,
    adxHigh: 10,
    mediumAdx: 25,
    highAdx: 30,
    liquidityBase: 3,
    liquidityBonus: 2,
    strongSpreadBps: 5,
  }),
  triggerModel: 'prospective_observations',
  benchmarkVolumeBasis: 'constituent_volume',
});
export const FIVE_MINUTES = 300_000;
export function validBar(bar: Bar): boolean {
  return (
    [bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume].every(
      Number.isSafeInteger,
    ) &&
    bar.open > 0 &&
    bar.close > 0 &&
    bar.low > 0 &&
    bar.volume >= 0 &&
    bar.high >= Math.max(bar.open, bar.close) &&
    bar.low <= Math.min(bar.open, bar.close)
  );
}
/** Fail closed on malformed / duplicate / missing minutes. A partial bucket never becomes a candle. */
export function aggregateClosedMinutes(minutes: readonly Bar[], now: number): Bar[] {
  const buckets = new Map<number, Bar[]>();
  for (const bar of minutes) {
    if (!validBar(bar)) throw new RangeError('Invalid minute candle');
    const open = sessionOpen(new Date(bar.timestamp)).getTime();
    const offset = bar.timestamp - open;
    if (offset < 0 || offset >= 375 * 60_000 || offset % 60_000 !== 0) continue;
    const bucket = open + Math.floor(offset / FIVE_MINUTES) * FIVE_MINUTES;
    const rows = buckets.get(bucket) ?? [];
    rows.push(bar);
    buckets.set(bucket, rows);
  }
  const result: Bar[] = [];
  for (const [timestamp, rows] of [...buckets].sort(([a], [b]) => a - b)) {
    if (timestamp + FIVE_MINUTES > now) continue;
    rows.sort((a, b) => a.timestamp - b.timestamp);
    if (rows.length !== 5 || rows.some((b, i) => b.timestamp !== timestamp + i * 60_000)) continue;
    const first = rows[0];
    const last = rows[4];
    if (!first || !last) continue;
    result.push({
      timestamp,
      open: first.open,
      close: last.close,
      high: Math.max(...rows.map((b) => b.high)),
      low: Math.min(...rows.map((b) => b.low)),
      volume: rows.reduce((s, b) => s + b.volume, 0),
    });
  }
  return result;
}
export function relativeVolume(bars: readonly Bar[], i: number): number | null {
  if (i < 20) return null;
  const baseline = bars.slice(i - 20, i).reduce((s, b) => s + b.volume, 0) / 20;
  return baseline > 0 && bars[i] ? bars[i].volume / baseline : null;
}
function indicators(bars: readonly Bar[]) {
  return {
    vwap: vwap(bars),
    ema9: ema(
      bars.map((b) => b.close),
      9,
    ),
    ema21: ema(
      bars.map((b) => b.close),
      21,
    ),
    atr: atr(bars),
    adx: adx(bars).adx,
  };
}
export function coherentSignalBars(bars: readonly Bar[], now: number): boolean {
  return bars.every((b, i) => {
    const prev = bars[i - 1];
    if (
      !validBar(b) ||
      istMinutesOfDay(new Date(b.timestamp)) < 555 ||
      istMinutesOfDay(new Date(b.timestamp)) >= 930 ||
      b.timestamp + FIVE_MINUTES > now ||
      (b.timestamp - sessionOpen(new Date(b.timestamp)).getTime()) % FIVE_MINUTES !== 0
    )
      return false;
    if (!prev) return true;
    if (b.timestamp <= prev.timestamp) return false;
    if (istDateKey(new Date(b.timestamp)) === istDateKey(new Date(prev.timestamp)))
      return b.timestamp === prev.timestamp + FIVE_MINUTES;
    // Session boundary is allowed only from the previous close to the next open.
    return (
      istMinutesOfDay(new Date(prev.timestamp)) === 925 &&
      istMinutesOfDay(new Date(b.timestamp)) === 555
    );
  });
}
export interface StrategyInput {
  bars: readonly Bar[];
  benchmark: readonly Bar[];
  now: number;
  tickSize: number;
  quote: { bid: number | null; ask: number | null; timestamp: number | null };
  averageDailyTurnoverPaise: number | null;
  marketOpen: boolean;
}
export interface StrategyDecision {
  evidence: SignalEvidence | null;
  failedConditions: string[];
  conditions: SignalCondition[];
}
/** Only closed prefix data enters this function. Rejected decisions retain explicit gate evidence. */
export function evaluateVwapSetup(
  input: StrategyInput,
  direction: 'BUY' | 'SELL',
): StrategyDecision {
  const { bars, benchmark, now } = input;
  const c = bars.at(-1);
  const n = benchmark.at(-1);
  const conditions: SignalCondition[] = [];
  const check = (
    id: string,
    label: string,
    passed: boolean,
    requiredValue: string,
    actualValue: string,
    explanation: string,
  ) => {
    conditions.push({ id, label, passed, requiredValue, actualValue, explanation });
    return passed;
  };
  const reject = (): StrategyDecision => ({
    evidence: null,
    failedConditions: conditions.filter((c) => !c.passed).map((c) => c.id),
    conditions,
  });
  if (
    !check(
      'CLOSED_HISTORY',
      'Closed candle coverage',
      bars.length >= VWAP_CONFIG.warmup && coherentSignalBars(bars, now),
      '250+ contiguous closed 5m candles',
      String(bars.length),
      'Incomplete, forming and out-of-order candles suppress publication.',
    ) ||
    !c
  )
    return reject();
  const date = istDateKey(new Date(c.timestamp));
  const open = sessionOpen(new Date(c.timestamp)).getTime();
  const today = bars.filter((b) => b.timestamp >= open);
  check(
    'SESSION',
    'Continuous session',
    input.marketOpen &&
      now >= open + 15 * 60_000 &&
      now < open + 345 * 60_000 &&
      now >= c.timestamp + FIVE_MINUTES &&
      now - c.timestamp - FIVE_MINUTES <= VWAP_CONFIG.maxPublicationDelayMs &&
      istDateKey(new Date(now)) === date,
    '09:30–15:00 IST; publication within 30 seconds of close',
    String(now - c.timestamp - FIVE_MINUTES),
    'Authoritative market-open status and an on-time closed candle are required.',
  );
  check(
    'OPENING_RANGE',
    'Opening range coverage',
    today[0]?.timestamp === open && today.length >= 4,
    'Complete first 15 minutes',
    String(today.length),
    'VWAP and the opening range must begin at 09:15 IST.',
  );
  if (
    !check(
      'BENCHMARK_UNAVAILABLE',
      'NIFTY confirmation data',
      benchmark.length >= VWAP_CONFIG.warmup &&
        coherentSignalBars(benchmark, now) &&
        n?.timestamp === c.timestamp &&
        benchmark.filter((b) => b.timestamp >= open).every((b) => b.volume > 0) &&
        benchmark.find((b) => b.timestamp === open) !== undefined,
      'Matching complete NIFTY history with constituent volume',
      n ? String(n.timestamp) : 'Unavailable',
      'Index volume is constituent-derived, not traded spot volume.',
    ) ||
    !n
  )
    return reject();
  const { bid, ask, timestamp } = input.quote;
  const spread =
    bid && ask && bid > 0 && ask > 0 && ask >= bid
      ? ((ask - bid) / ((ask + bid) / 2)) * 10_000
      : null;
  check(
    'LIQUIDITY',
    'Spread and turnover',
    timestamp !== null &&
      now >= timestamp &&
      now - timestamp <= VWAP_CONFIG.maxQuoteAgeMs &&
      spread !== null &&
      spread <= VWAP_CONFIG.maxSpreadBps &&
      input.averageDailyTurnoverPaise !== null &&
      input.averageDailyTurnoverPaise >= VWAP_CONFIG.minTurnoverPaise,
    'Spread ≤10 bps; quote ≤15s; 20-session turnover ≥₹25 crore',
    `Spread ${spread?.toFixed(2) ?? 'unavailable'} bps`,
    'Observed bid/ask and twenty completed daily candles are required.',
  );
  if (conditions.some((c) => !c.passed)) return reject();
  const s = indicators(bars);
  const ns = indicators(benchmark);
  const i = bars.length - 1;
  const v = s.vwap[i];
  const e9 = s.ema9[i];
  const e21 = s.ema21[i];
  const a = s.atr[i];
  const dx = s.adx[i];
  const rv = relativeVolume(bars, i);
  const nv = ns.vwap.at(-1);
  const ne9 = ns.ema9.at(-1);
  const ne21 = ns.ema21.at(-1);
  if (!v || !e9 || !e21 || !a || dx == null || rv == null || !nv || !ne9 || !ne21) {
    check(
      'WARMUP',
      'Indicator warm-up',
      false,
      'All indicators defined',
      'Unavailable',
      'No substitution for missing indicator values.',
    );
    return reject();
  }
  const sign = direction === 'BUY' ? 1 : -1;
  const range = today.slice(0, 3);
  const openingHigh = Math.max(...range.map((b) => b.high));
  const openingLow = Math.min(...range.map((b) => b.low));
  const openingMid = Math.round((openingHigh + openingLow) / 2);
  const trendAt = (j: number): boolean => {
    const b = bars[j];
    const p = bars[j - 3];
    const va = s.vwap[j];
    const vb = s.vwap[j - 3];
    const fast = s.ema9[j];
    const slow = s.ema21[j];
    const old = s.ema21[j - 3];
    const strength = s.adx[j];
    const volatility = s.atr[j];
    return Boolean(
      b &&
        p &&
        p.timestamp >= open &&
        va &&
        vb &&
        fast &&
        slow &&
        old &&
        volatility &&
        strength != null &&
        sign * (b.close - va) > 0 &&
        sign * (va - vb) > 0 &&
        sign * (fast - slow) > 0 &&
        sign * (slow - old) > 0 &&
        strength >= VWAP_CONFIG.minAdx &&
        sign * (b.close - openingMid) > 0 &&
        Math.abs(b.close - va) <= VWAP_CONFIG.maxDistanceAtr * volatility,
    );
  };
  check(
    'PRICE_VWAP',
    'Price versus VWAP',
    sign * (c.close - v) > 0,
    direction === 'BUY' ? 'Close above VWAP' : 'Close below VWAP',
    `${c.close} / ${v} paise`,
    'Price must agree with the signal direction.',
  );
  check(
    'TREND',
    'VWAP slope and EMA alignment',
    trendAt(i),
    'Directional 3-bar VWAP/EMA21 slope, EMA9/21 alignment, OR midpoint and ≤2.5 ATR distance',
    `EMA9 ${e9}; EMA21 ${e21} paise`,
    'Trend gates are checked again at confirmation.',
  );
  check(
    'ADX',
    'Trend strength',
    dx >= VWAP_CONFIG.minAdx,
    'ADX ≥22',
    dx.toFixed(2),
    'Wilder ADX14.',
  );
  check(
    'RELATIVE_VOLUME',
    'Relative volume',
    rv >= VWAP_CONFIG.minRvol,
    'Current volume / previous 20 mean ≥1.2',
    rv.toFixed(2),
    'The confirmation candle is excluded from its own baseline.',
  );
  check(
    'NIFTY_ALIGNMENT',
    'NIFTY alignment',
    sign * (n.close - nv) > 0 && sign * (ne9 - ne21) > 0,
    'Directional price/VWAP and EMA9/21 alignment',
    `Close ${n.close}; VWAP ${nv} paise`,
    'NIFTY VWAP uses constituent trading volume.',
  );
  let pullback: readonly Bar[] | null = null;
  let depth = 0;
  let touchDistance = Number.POSITIVE_INFINITY;
  let frozenAtr = 0;
  for (let count = 1; count <= VWAP_CONFIG.maxPullbackBars; count++) {
    const start = i - count;
    const prior = bars[start - 1];
    const pa = s.atr[start - 1];
    if (!prior || !pa || !trendAt(start - 1)) continue;
    const candidate = bars.slice(start, i);
    const extreme =
      sign === 1
        ? Math.min(...candidate.map((b) => b.low))
        : Math.max(...candidate.map((b) => b.high));
    const d = sign === 1 ? prior.high - extreme : extreme - prior.low;
    let distance = Number.POSITIVE_INFINITY;
    const valid = candidate.every((b, k) => {
      const vv = s.vwap[start + k];
      const ee = s.ema21[start + k];
      if (!vv || !ee || b.timestamp < open) return false;
      const edge = sign === 1 ? b.low : b.high;
      distance = Math.min(distance, Math.abs(edge - vv) / vv, Math.abs(edge - ee) / ee);
      return !(
        sign * (b.close - vv) < -VWAP_CONFIG.invalidationBufferAtr * pa &&
        sign * (b.close - ee) < -VWAP_CONFIG.invalidationBufferAtr * pa
      );
    });
    if (
      valid &&
      d > 0 &&
      d <= VWAP_CONFIG.maxRiskAtr * pa &&
      distance <= VWAP_CONFIG.pullbackTouchRatio
    ) {
      pullback = candidate;
      depth = d;
      touchDistance = distance;
      frozenAtr = pa;
      break;
    }
  }
  check(
    'PULLBACK',
    'Pullback validation',
    pullback !== null,
    '1–3 bars; touch within 15 bps; depth ≤1.2 ATR',
    pullback ? `${pullback.length} bars; depth ${depth} paise` : 'No valid sequence',
    'A valid trend must precede the pullback; confirmation is a separate candle.',
  );
  const prev = bars[i - 1];
  const body = c.high > c.low ? Math.abs(c.close - c.open) / (c.high - c.low) : 0;
  check(
    'CONFIRMATION',
    'Confirmation candle',
    Boolean(
      prev &&
        sign * (c.close - c.open) > 0 &&
        (sign === 1 ? c.close > prev.high : c.close < prev.low) &&
        sign * (c.close - e9) > 0 &&
        body >= VWAP_CONFIG.minBodyRatio,
    ),
    'Directional break of prior candle; body ≥50%; close beyond EMA9',
    `Body ${(body * 100).toFixed(1)}%`,
    'Only the completed candle confirms the pullback.',
  );
  if (!pullback || conditions.some((c) => !c.passed)) return reject();
  const tick = input.tickSize;
  if (!Number.isSafeInteger(tick) || tick <= 0) {
    check(
      'TICK_SIZE',
      'Tick size',
      false,
      'Valid instrument tick',
      String(tick),
      'No guessed tick size.',
    );
    return reject();
  }
  const round = (p: number, up: boolean) =>
    (up ? Math.ceil(p / tick) : Math.floor(p / tick)) * tick;
  const trigger = round(sign === 1 ? c.high + tick : c.low - tick, sign === 1);
  const invalidation = round(
    sign === 1
      ? Math.min(...pullback.map((b) => b.low)) - VWAP_CONFIG.invalidationBufferAtr * a
      : Math.max(...pullback.map((b) => b.high)) + VWAP_CONFIG.invalidationBufferAtr * a,
    sign !== 1,
  );
  const risk = sign * (trigger - invalidation);
  const target1 = round(trigger + sign * risk * VWAP_CONFIG.target1R, sign === 1);
  const target2 = round(trigger + sign * risk * VWAP_CONFIG.target2R, sign === 1);
  check(
    'RISK_REWARD',
    'Technical risk and reward',
    Math.min(trigger, invalidation, target1, target2) > 0 &&
      risk > 0 &&
      risk <= VWAP_CONFIG.maxRiskAtr * a &&
      (sign * (target1 - trigger)) / risk >= VWAP_CONFIG.target1R,
    'Risk >0 and ≤1.2 ATR; gross target 1 ≥1.5R',
    `Risk ${risk} paise`,
    'Levels are directionally rounded to the instrument tick. Costs are reported separately.',
  );
  const vBefore = s.vwap[i - 3] ?? v;
  const eBefore = s.ema21[i - 3] ?? e21;
  const w = VWAP_CONFIG.scoring;
  const factors: SignalFactor[] = [
    {
      id: 'trend',
      label: 'Trend',
      earned:
        w.trendBase +
        (Math.abs(v - vBefore) / vBefore >= w.trendSlope &&
        Math.abs(e21 - eBefore) / eBefore >= w.trendSlope
          ? w.trendBonus
          : 0),
      max: w.trendBase + w.trendBonus,
    },
    {
      id: 'pullback',
      label: 'Pullback',
      earned:
        w.pullbackBase +
        (depth <= w.strongDepthAtr * frozenAtr ? w.pullbackDepthBonus : 0) +
        (touchDistance <= w.strongTouchRatio ? w.pullbackTouchBonus : 0),
      max: w.pullbackBase + w.pullbackDepthBonus + w.pullbackTouchBonus,
    },
    {
      id: 'confirmation',
      label: 'Confirmation',
      earned: w.confirmationBase + (body >= w.strongBodyRatio ? w.confirmationBonus : 0),
      max: w.confirmationBase + w.confirmationBonus,
    },
    {
      id: 'volume',
      label: 'Relative volume',
      earned: rv >= w.highRvol ? w.volumeHigh : rv >= w.mediumRvol ? w.volumeMedium : w.volumeBase,
      max: w.volumeHigh,
    },
    { id: 'benchmark', label: 'NIFTY', earned: w.benchmark, max: w.benchmark },
    {
      id: 'adx',
      label: 'ADX',
      earned: dx >= w.highAdx ? w.adxHigh : dx >= w.mediumAdx ? w.adxMedium : w.adxBase,
      max: w.adxHigh,
    },
    {
      id: 'liquidity',
      label: 'Liquidity',
      earned:
        w.liquidityBase + (spread !== null && spread <= w.strongSpreadBps ? w.liquidityBonus : 0),
      max: w.liquidityBase + w.liquidityBonus,
    },
  ];
  const score = factors.reduce((s, f) => s + f.earned, 0);
  check(
    'QUALITY',
    'Explained setup quality',
    score >= VWAP_CONFIG.minScore,
    '≥70 / 100',
    String(score),
    'Sum of persisted component scores, not a probability of profit.',
  );
  if (conditions.some((c) => !c.passed)) return reject();
  return {
    failedConditions: [],
    conditions,
    evidence: {
      strategyName: STRATEGY_NAME,
      direction,
      confirmationAt: c.timestamp + FIVE_MINUTES,
      sessionDate: date,
      levels: { trigger, invalidation, target1, target2, risk, tickSize: tick },
      score,
      factors,
      conditions,
      indicators: {
        vwap: v,
        ema9: e9,
        ema21: e21,
        atr: a,
        adx: dx,
        relativeVolume: rv,
        openingHigh,
        openingLow,
        openingMid,
      },
      benchmark: {
        symbol: 'NIFTY50',
        volumeBasis: 'constituent_volume',
        close: n.close,
        vwap: nv,
        ema9: ne9,
        ema21: ne21,
      },
      overlays: bars.flatMap((b, j) =>
        b.timestamp >= open
          ? [
              {
                timestamp: b.timestamp,
                vwap: s.vwap[j] ?? null,
                ema9: s.ema9[j] ?? null,
                ema21: s.ema21[j] ?? null,
              },
            ]
          : [],
      ),
      sourceFrom: bars[0]?.timestamp ?? open,
    },
  };
}

/** Market context uses the same closed-bar indicator convention as signal decisions. */
export function vwapMarketContext(bars: readonly Bar[], now: number): ScannerSnapshot['benchmark'] {
  if (bars.length < VWAP_CONFIG.warmup || !coherentSignalBars(bars, now)) return null;
  const bar = bars.at(-1);
  const values = indicators(bars);
  const v = values.vwap.at(-1),
    fast = values.ema9.at(-1),
    slow = values.ema21.at(-1),
    strength = values.adx.at(-1);
  if (!bar || !v || !fast || !slow || strength == null) return null;
  return {
    at: bar.timestamp + FIVE_MINUTES,
    close: bar.close,
    vwap: v,
    ema9: fast,
    ema21: slow,
    adx: strength,
    direction:
      bar.close > v && fast > slow ? 'Bullish' : bar.close < v && fast < slow ? 'Bearish' : 'Mixed',
    regime: strength >= VWAP_CONFIG.minAdx ? 'Trending' : 'Range / weak trend',
  };
}
