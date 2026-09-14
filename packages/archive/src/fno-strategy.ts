import { atr, ema, vwap } from '@equitywise/core';
import type { FnoCandle, FnoSetup, FnoStrategyConfig } from './fno-types.js';

/**
 * "Futures VWAP + OI Buildup" — a research strategy for a single futures
 * contract's 5-minute closed candles. Pure: candles + config in, setups out.
 *
 * Long thesis: in an up-trend (price above session VWAP, fast EMA above slow),
 * a pullback that closes back above VWAP with FRESH open-interest buildup and
 * above-average volume is a technical entry zone. Short mirrors it. Open
 * interest is the F&O-specific factor a cash-equity strategy cannot use.
 *
 * No lookahead: a setup at bar i uses only indicators through bar i. Triggering,
 * filling and exiting happen strictly on later bars (see fno-backtest).
 */

const roundUpTick = (p: number, tick: number): number => Math.ceil(p / tick) * tick;
const roundDownTick = (p: number, tick: number): number => Math.floor(p / tick) * tick;

export function evaluateFuturesVwapOi(
  candles: readonly FnoCandle[],
  config: FnoStrategyConfig,
): FnoSetup[] {
  const closes = candles.map((c) => c.close);
  const vwapSeries = vwap(candles);
  const emaFastSeries = ema(closes, config.emaFast);
  const emaSlowSeries = ema(closes, config.emaSlow);
  const atrSeries = atr(candles, config.atrPeriod);

  const setups: FnoSetup[] = [];
  let volumeSum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    if (!c) continue;
    volumeSum += c.volume;

    if (i < config.warmupBars || i < config.oiLookback) continue;

    const v = vwapSeries[i];
    const ef = emaFastSeries[i];
    const es = emaSlowSeries[i];
    const a = atrSeries[i];
    if (v == null || ef == null || es == null || a == null) continue;

    const prevOi = candles[i - config.oiLookback]?.oi;
    if (prevOi == null) continue;
    const oiChange = c.oi - prevOi;
    const oiRising = oiChange > 0;

    const runningAvgVolume = volumeSum / (i + 1);
    const volumeOk = c.volume >= runningAvgVolume * config.volumeMultiple;

    const factors = {
      vwap: v,
      distanceToVwapPaise: c.close - v,
      emaFast: ef,
      emaSlow: es,
      atr: a,
      oiChange,
      runningAvgVolume,
      barVolume: c.volume,
    };

    // Bullish: uptrend, pullback toward VWAP, closes back above it, green bar.
    if (ef > es && c.close > v && c.open < c.close) {
      const pulledBack = c.low <= v + config.pullbackAtrMult * a;
      if (pulledBack && oiRising && volumeOk) {
        const triggerLevel = roundUpTick(c.high + config.tickPaise, config.tickPaise);
        const invalidationLevel = roundDownTick(c.low, config.tickPaise);
        const risk = triggerLevel - invalidationLevel;
        if (risk > 0) {
          setups.push({
            index: i,
            timestamp: c.timestamp,
            direction: 'BULLISH',
            triggerLevel,
            invalidationLevel,
            target1: roundUpTick(triggerLevel + config.targetR[0] * risk, config.tickPaise),
            target2: roundUpTick(triggerLevel + config.targetR[1] * risk, config.tickPaise),
            riskPaise: risk,
            factors,
          });
          continue;
        }
      }
    }

    // Bearish mirror: downtrend, rally toward VWAP, closes back below it, red bar.
    if (ef < es && c.close < v && c.open > c.close) {
      const ralliedBack = c.high >= v - config.pullbackAtrMult * a;
      if (ralliedBack && oiRising && volumeOk) {
        const triggerLevel = roundDownTick(c.low - config.tickPaise, config.tickPaise);
        const invalidationLevel = roundUpTick(c.high, config.tickPaise);
        const risk = invalidationLevel - triggerLevel;
        if (risk > 0) {
          setups.push({
            index: i,
            timestamp: c.timestamp,
            direction: 'BEARISH',
            triggerLevel,
            invalidationLevel,
            target1: roundDownTick(triggerLevel - config.targetR[0] * risk, config.tickPaise),
            target2: roundDownTick(triggerLevel - config.targetR[1] * risk, config.tickPaise),
            riskPaise: risk,
            factors,
          });
        }
      }
    }
  }

  return setups;
}
