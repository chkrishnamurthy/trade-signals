import type { Bar } from '../types.js';
import { groupBySession, sessionSlot } from './bars.js';
import type { IntradayConfig } from './config.js';

/**
 * Intraday volume, normalised for the time of day.
 *
 * This is the correction that makes volume usable intraday at all. Comparing
 * 10:00 volume against a full-day average calls every morning a surge and
 * every lunchtime a drought — the same stock, the same behaviour, two opposite
 * readings depending only on the clock. Indian sessions have a pronounced
 * U-shape: the first and last thirty minutes carry a large share of the day.
 *
 * So the comparison is against the SAME MINUTE of prior sessions. "1.8×
 * normal" then means 1.8× what this stock normally trades at 10:04, which is
 * a claim about participation rather than about the clock.
 *
 * Volumes are share counts, not money, so they stay plain numbers.
 */

/** The full continuous session is 375 minutes; profile slots cover all of it. */
export const PROFILE_SLOTS = 375;

/**
 * Average volume per minute-of-session, built from prior sessions' 1m bars.
 *
 * A session is only counted for a slot if it actually reached that slot — a
 * short or truncated session must not drag the late-afternoon averages toward
 * zero and make every 15:00 bar look like a volume spike.
 *
 * A minute inside a session with no bar is a genuine zero (no trades printed),
 * so it counts as zero rather than being skipped.
 */
export function buildVolumeProfile(
  priorMinuteBars: readonly Bar[],
  config: IntradayConfig,
): number[] {
  const sessions = groupBySession(priorMinuteBars).slice(-config.volume.profileSessions);

  const totals = new Array<number>(PROFILE_SLOTS).fill(0);
  const counts = new Array<number>(PROFILE_SLOTS).fill(0);

  for (const session of sessions) {
    const bySlot = new Map<number, number>();
    let lastSlot = -1;
    for (const bar of session) {
      const slot = sessionSlot(bar.timestamp);
      if (slot < 0 || slot >= PROFILE_SLOTS) continue;
      bySlot.set(slot, (bySlot.get(slot) ?? 0) + bar.volume);
      if (slot > lastSlot) lastSlot = slot;
    }
    if (lastSlot < 0) continue;

    for (let slot = 0; slot <= lastSlot; slot += 1) {
      totals[slot] = (totals[slot] ?? 0) + (bySlot.get(slot) ?? 0);
      counts[slot] = (counts[slot] ?? 0) + 1;
    }
  }

  return totals.map((total, slot) => {
    const count = counts[slot] ?? 0;
    return count === 0 ? 0 : total / count;
  });
}

/** Expected cumulative volume from the open through `slot`, inclusive. */
export function expectedCumulative(profile: readonly number[], slot: number): number {
  let sum = 0;
  const end = Math.min(slot, profile.length - 1);
  for (let i = 0; i <= end; i += 1) sum += profile[i] ?? 0;
  return sum;
}

/** Expected volume for a bar spanning `[startSlot, startSlot + minutes)`. */
export function expectedForBar(
  profile: readonly number[],
  startSlot: number,
  minutes: number,
): number {
  let sum = 0;
  for (let i = startSlot; i < startSlot + minutes && i < profile.length; i += 1) {
    sum += profile[i] ?? 0;
  }
  return sum;
}

export interface VolumeRead {
  /** Session volume so far ÷ what this symbol normally has by now. */
  readonly relativeVolume: number | null;
  /** The last closed bar's volume ÷ what that slot normally carries. */
  readonly barRelativeVolume: number | null;
  readonly sessionVolume: number;
  /** Turnover so far today, paise. Approximated at each bar's typical price. */
  readonly sessionTurnover: number;
  /** True when there is no usable profile to compare against. */
  readonly profileMissing: boolean;
}

/**
 * Reads today's volume against the profile.
 *
 * Returns nulls rather than 1.0 when the profile is empty. A relative volume
 * of exactly 1.0 reads as "perfectly normal participation", which is a
 * confident claim to make from no data at all.
 */
export function readVolume(
  sessionMinuteBars: readonly Bar[],
  profile: readonly number[],
  lastBar: Bar | undefined,
  barMinutes: number,
): VolumeRead {
  let sessionVolume = 0;
  let sessionTurnover = 0;
  for (const bar of sessionMinuteBars) {
    sessionVolume += bar.volume;
    sessionTurnover += Math.round((bar.high + bar.low + bar.close) / 3) * bar.volume;
  }

  const profileMissing = profile.every((value) => value === 0);
  if (profileMissing || lastBar === undefined) {
    return {
      relativeVolume: null,
      barRelativeVolume: null,
      sessionVolume,
      sessionTurnover,
      profileMissing,
    };
  }

  const lastMinuteBar = sessionMinuteBars.at(-1);
  const currentSlot = lastMinuteBar === undefined ? 0 : sessionSlot(lastMinuteBar.timestamp);
  const expectedSoFar = expectedCumulative(profile, currentSlot);

  const barSlot = sessionSlot(lastBar.timestamp);
  const expectedBar = expectedForBar(profile, barSlot, barMinutes);

  return {
    relativeVolume: expectedSoFar > 0 ? sessionVolume / expectedSoFar : null,
    barRelativeVolume: expectedBar > 0 ? lastBar.volume / expectedBar : null,
    sessionVolume,
    sessionTurnover,
    profileMissing,
  };
}

export interface LiquidityVerdict {
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly averageDailyVolume: number | null;
}

/**
 * Whether a symbol is liquid enough to generate an intraday signal at all.
 *
 * Applied before any analysis, not after. An illiquid name produces beautiful
 * technical patterns that cannot be acted on at anything near the printed
 * price, and scoring it first only makes the false confidence more expensive.
 *
 * Spread is not checked because the provider does not supply depth; that
 * absence is recorded here rather than papered over with a proxy.
 */
export function assessLiquidity(
  dailyBars: readonly Bar[],
  price: number,
  sessionTurnover: number,
  config: IntradayConfig,
): LiquidityVerdict {
  const reasons: string[] = [];
  const recent = dailyBars.slice(-20);
  const averageDailyVolume =
    recent.length === 0
      ? null
      : Math.round(recent.reduce((sum, bar) => sum + bar.volume, 0) / recent.length);

  if (averageDailyVolume === null) {
    reasons.push('No daily history to judge liquidity from');
  } else if (averageDailyVolume < config.liquidity.minAverageDailyVolume) {
    reasons.push(
      `Average daily volume ${averageDailyVolume.toLocaleString('en-IN')} is below the ${config.liquidity.minAverageDailyVolume.toLocaleString('en-IN')} floor`,
    );
  }

  if (price < config.liquidity.minPrice) {
    reasons.push('Price is below the minimum for intraday analysis');
  }

  if (sessionTurnover < config.liquidity.minSessionTurnover) {
    reasons.push('Session turnover so far is too thin to act on');
  }

  return { eligible: reasons.length === 0, reasons, averageDailyVolume };
}
