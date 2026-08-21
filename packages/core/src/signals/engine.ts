import { atr, ema, macd, rsi } from '../indicators/index.js';
import { type Bar, latest } from '../types.js';
import { DEFAULT_STRATEGY, type StrategyConfig } from './config.js';

/**
 * Technical signal engine.
 *
 * Pure: bars in, verdict out. No clock, no network, no state (CLAUDE.md hard
 * rule 1), which is what lets a backtest and the live dashboard run this exact
 * code.
 *
 * Every verdict carries the factor breakdown that produced it, so the UI can
 * answer "why?" without recomputing (hard rule 8).
 *
 * These are TECHNICAL OBSERVATIONS, not recommendations. Nothing here emits
 * BUY or SELL.
 */

export type SignalDirection =
  | 'strong_bullish'
  | 'bullish'
  | 'neutral'
  | 'bearish'
  | 'strong_bearish';

export interface SignalFactor {
  readonly key: string;
  readonly label: string;
  /** −1 (bearish) … +1 (bullish). 0 means the factor was neutral. */
  readonly score: number;
  readonly weight: number;
  /** Human-readable evidence, e.g. "RSI 61.4". */
  readonly detail: string;
}

export interface IndicatorSnapshot {
  readonly close: number;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly ema200: number | null;
  readonly rsi: number | null;
  readonly macd: number | null;
  readonly macdSignal: number | null;
  readonly macdHistogram: number | null;
  readonly atr: number | null;
  /** Current volume ÷ average volume over `volumeLookback` bars. */
  readonly relativeVolume: number | null;
  readonly averageVolume: number | null;
  readonly high52w: number | null;
  readonly low52w: number | null;
}

export interface SignalReport {
  readonly direction: SignalDirection;
  /** 0–100. 50 is neutral; above is bullish, below bearish. */
  readonly strength: number;
  /** Signed −1…+1 before mapping to strength. */
  readonly bias: number;
  readonly factors: readonly SignalFactor[];
  readonly indicators: IndicatorSnapshot;
  /** Named setups detected, e.g. "Golden cross". */
  readonly setups: readonly string[];
  /** True when there were not enough bars to judge. */
  readonly insufficientData: boolean;
}

const MIN_BARS = 30;

/**
 * Evaluates a bar series.
 *
 * `bars` must be CLOSED candles in ascending time order. Passing a forming
 * candle is lookahead bias and invalidates any backtest built on it (hard
 * rule 2) — this function cannot detect that, so callers must not do it.
 */
export function evaluateSignals(
  bars: readonly Bar[],
  config: StrategyConfig = DEFAULT_STRATEGY,
): SignalReport {
  const closes = bars.map((b) => b.close);
  const lastBar = bars.at(-1);

  if (lastBar === undefined || bars.length < MIN_BARS) {
    return {
      direction: 'neutral',
      strength: 50,
      bias: 0,
      factors: [],
      indicators: emptySnapshot(lastBar?.close ?? 0),
      setups: [],
      insufficientData: true,
    };
  }

  const ema20 = ema(closes, config.emaFast);
  const ema50 = ema(closes, config.emaMedium);
  const ema200 = ema(closes, config.emaSlow);
  const rsiSeries = rsi(closes, config.rsiPeriod);
  const macdResult = macd(closes, config.macd);
  const atrSeries = atr(bars, config.atrPeriod);

  const close = lastBar.close;
  const e20 = latest(ema20);
  const e50 = latest(ema50);
  const e200 = latest(ema200);
  const rsiValue = latest(rsiSeries);
  const macdValue = latest(macdResult.macd);
  const macdSignalValue = latest(macdResult.signal);
  const histNow = macdResult.histogram.at(-1) ?? null;
  const histPrev = macdResult.histogram.at(-2) ?? null;

  const volumes = bars.map((b) => b.volume);
  const lookback = Math.min(config.volumeLookback, volumes.length - 1);
  const priorVolumes = volumes.slice(-1 - lookback, -1);
  const averageVolume =
    priorVolumes.length === 0
      ? null
      : Math.round(priorVolumes.reduce((sum, v) => sum + v, 0) / priorVolumes.length);
  const relativeVolume =
    averageVolume === null || averageVolume === 0 ? null : lastBar.volume / averageVolume;

  const factors: SignalFactor[] = [];
  const setups: string[] = [];
  const w = config.weights;

  // --- Trend: price relative to each EMA -----------------------------------
  pushEmaFactor(factors, 'aboveEma20', `Above ${config.emaFast} EMA`, close, e20, w.aboveEma20);
  pushEmaFactor(factors, 'aboveEma50', `Above ${config.emaMedium} EMA`, close, e50, w.aboveEma50);
  pushEmaFactor(factors, 'aboveEma200', `Above ${config.emaSlow} EMA`, close, e200, w.aboveEma200);

  // --- Trend alignment: the EMAs stacked in order --------------------------
  if (e20 !== null && e50 !== null) {
    const aligned = e20 > e50;
    factors.push({
      key: 'emaAlignment',
      label: `${config.emaFast} EMA vs ${config.emaMedium} EMA`,
      score: aligned ? 1 : -1,
      weight: w.emaAlignment,
      detail: aligned ? 'Fast EMA above slow — uptrend' : 'Fast EMA below slow — downtrend',
    });
    if (e200 !== null) {
      if (aligned && e50 > e200) setups.push('Golden cross alignment');
      if (!aligned && e50 < e200) setups.push('Death cross alignment');
    }
  }

  // --- Momentum: RSI --------------------------------------------------------
  if (rsiValue !== null) {
    let score = 0;
    let detail = `RSI ${rsiValue.toFixed(1)}`;
    if (rsiValue >= config.rsiOverbought) {
      // Strong, but stretched — credited less than clean momentum.
      score = 0.4;
      detail += ' — overbought';
      setups.push('Overbought');
    } else if (rsiValue >= config.rsiBullish.min) {
      score = 1;
      detail += ' — bullish momentum';
    } else if (rsiValue <= config.rsiOversold) {
      score = -0.4;
      detail += ' — oversold';
      setups.push('Oversold');
    } else {
      score = -1;
      detail += ' — weak momentum';
    }
    factors.push({
      key: 'rsiMomentum',
      label: 'RSI momentum',
      score,
      weight: w.rsiMomentum,
      detail,
    });
  }

  // --- Momentum: MACD -------------------------------------------------------
  if (histNow !== null) {
    factors.push({
      key: 'macdHistogram',
      label: 'MACD histogram',
      score: histNow > 0 ? 1 : -1,
      weight: w.macdHistogram,
      detail: histNow > 0 ? 'Histogram positive' : 'Histogram negative',
    });

    // A crossover is the histogram changing sign between the last two bars.
    if (histPrev !== null && Math.sign(histNow) !== Math.sign(histPrev) && histPrev !== 0) {
      const bullish = histNow > 0;
      factors.push({
        key: 'macdCrossover',
        label: 'MACD crossover',
        score: bullish ? 1 : -1,
        weight: w.macdCrossover,
        detail: bullish ? 'Bullish crossover on the last bar' : 'Bearish crossover on the last bar',
      });
      setups.push(bullish ? 'MACD bullish crossover' : 'MACD bearish crossover');
    }
  }

  // --- Participation: volume ------------------------------------------------
  if (relativeVolume !== null) {
    const elevated = relativeVolume >= 1.5;
    const quiet = relativeVolume < 0.7;
    const priceUp = bars.length > 1 && close > (bars.at(-2)?.close ?? close);
    factors.push({
      key: 'volumeConfirmation',
      label: 'Volume confirmation',
      // Volume only confirms direction; heavy volume on a down bar is bearish.
      score: elevated ? (priceUp ? 1 : -1) : quiet ? 0 : priceUp ? 0.3 : -0.3,
      weight: w.volumeConfirmation,
      detail: `${relativeVolume.toFixed(2)}× average volume`,
    });
    if (elevated) setups.push(priceUp ? 'Volume breakout' : 'High-volume selling');
  }

  // --- Structure: higher highs / lower lows ---------------------------------
  const structure = detectStructure(bars, config.structureLookback);
  if (structure !== 0) {
    factors.push({
      key: 'structure',
      label: 'Price structure',
      score: structure,
      weight: w.structure,
      detail: structure > 0 ? 'Higher high formation' : 'Lower low formation',
    });
    setups.push(structure > 0 ? 'Higher-high structure' : 'Lower-low structure');
  }

  // --- Breakout of the recent range ----------------------------------------
  const window = bars.slice(-config.structureLookback - 1, -1);
  if (window.length > 0) {
    const rangeHigh = Math.max(...window.map((b) => b.high));
    const rangeLow = Math.min(...window.map((b) => b.low));
    if (close > rangeHigh) setups.push('Breakout');
    else if (close < rangeLow) setups.push('Breakdown');
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const bias =
    totalWeight === 0 ? 0 : factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight;

  const highs52 = bars.slice(-252).map((b) => b.high);
  const lows52 = bars.slice(-252).map((b) => b.low);

  return {
    direction: directionFor(bias),
    strength: Math.round((bias + 1) * 50),
    bias,
    factors,
    setups: [...new Set(setups)],
    insufficientData: false,
    indicators: {
      close,
      ema20: e20,
      ema50: e50,
      ema200: e200,
      rsi: rsiValue,
      macd: macdValue,
      macdSignal: macdSignalValue,
      macdHistogram: histNow,
      atr: latest(atrSeries),
      relativeVolume,
      averageVolume,
      high52w: highs52.length > 0 ? Math.max(...highs52) : null,
      low52w: lows52.length > 0 ? Math.min(...lows52) : null,
    },
  };
}

function pushEmaFactor(
  factors: SignalFactor[],
  key: string,
  label: string,
  close: number,
  emaValue: number | null,
  weight: number,
): void {
  if (emaValue === null) return;
  const above = close > emaValue;
  const distance = ((close - emaValue) / emaValue) * 100;
  factors.push({
    key,
    label,
    score: above ? 1 : -1,
    weight,
    detail: `${above ? 'Above' : 'Below'} by ${Math.abs(distance).toFixed(2)}%`,
  });
}

/** +1 for a higher high AND higher low, −1 for the mirror, 0 otherwise. */
function detectStructure(bars: readonly Bar[], lookback: number): number {
  if (bars.length < lookback * 2) return 0;
  const recent = bars.slice(-lookback);
  const prior = bars.slice(-lookback * 2, -lookback);
  if (recent.length === 0 || prior.length === 0) return 0;

  const recentHigh = Math.max(...recent.map((b) => b.high));
  const priorHigh = Math.max(...prior.map((b) => b.high));
  const recentLow = Math.min(...recent.map((b) => b.low));
  const priorLow = Math.min(...prior.map((b) => b.low));

  if (recentHigh > priorHigh && recentLow > priorLow) return 1;
  if (recentHigh < priorHigh && recentLow < priorLow) return -1;
  return 0;
}

function directionFor(bias: number): SignalDirection {
  if (bias >= 0.55) return 'strong_bullish';
  if (bias >= 0.2) return 'bullish';
  if (bias <= -0.55) return 'strong_bearish';
  if (bias <= -0.2) return 'bearish';
  return 'neutral';
}

function emptySnapshot(close: number): IndicatorSnapshot {
  return {
    close,
    ema20: null,
    ema50: null,
    ema200: null,
    rsi: null,
    macd: null,
    macdSignal: null,
    macdHistogram: null,
    atr: null,
    relativeVolume: null,
    averageVolume: null,
    high52w: null,
    low52w: null,
  };
}
