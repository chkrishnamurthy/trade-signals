/**
 * Institutional-flow reads: pure functions over closed-session data.
 *
 * Nothing here touches a clock, a database or a provider (hard rule 1). Each
 * function takes two or more CLOSED sessions' figures and returns a label or a
 * score WITH the factors that produced it, so the page never shows a number it
 * cannot explain (CLAUDE.md: every score renders with its breakdown).
 */

// ---------------------------------------------------------------------------
// Open-interest build-up
// ---------------------------------------------------------------------------

/**
 * The standard four-way read of price change × open-interest change.
 *
 *   price ↑ OI ↑  long build-up     new longs coming in
 *   price ↓ OI ↑  short build-up    new shorts coming in
 *   price ↑ OI ↓  short covering    shorts closing, lifting price
 *   price ↓ OI ↓  long unwinding    longs closing, dragging price
 *
 * Technical vocabulary about positioning, not a direction call — nothing here
 * says BUY or SELL.
 */
export type OiBuildup = 'long_buildup' | 'short_buildup' | 'short_covering' | 'long_unwinding';

export interface OiBuildupInput {
  /** Close − previous close, paise. */
  readonly closeChange: number;
  /** OI − previous OI, in the exchange's unit. */
  readonly oiChange: number;
}

/** Null when either change is zero or not finite: "no read" beats a wrong one. */
export function classifyOiBuildup({ closeChange, oiChange }: OiBuildupInput): OiBuildup | null {
  if (!Number.isFinite(closeChange) || !Number.isFinite(oiChange)) return null;
  if (closeChange === 0 || oiChange === 0) return null;
  if (oiChange > 0) return closeChange > 0 ? 'long_buildup' : 'short_buildup';
  return closeChange > 0 ? 'short_covering' : 'long_unwinding';
}

/** Whether a build-up label reads as accumulation (green) or distribution (red). */
export function buildupTone(buildup: OiBuildup): 'positive' | 'negative' {
  return buildup === 'long_buildup' || buildup === 'short_covering' ? 'positive' : 'negative';
}

// ---------------------------------------------------------------------------
// Delivery anomaly
// ---------------------------------------------------------------------------

export interface DeliveryAnomaly {
  /** Today's delivery % ÷ trailing mean. 1 is average; null without a baseline. */
  readonly ratio: number | null;
  /** Today − trailing mean, in percentage points. */
  readonly delta: number | null;
  /** (today − mean) ÷ sample stdev of the trailing sessions. Null under 5 sessions. */
  readonly zScore: number | null;
  readonly trailingSessions: number;
}

/** Minimum trailing sessions before a z-score means anything. */
export const MIN_SESSIONS_FOR_Z = 5;

/**
 * Today's delivery % against its own trailing history.
 *
 * `trailing` is the prior sessions' delivery percentages, any order; today is
 * NOT among them. A stock that always delivers 70 % is not interesting at
 * 72 %; a stock that averages 30 % is at 60 %. That is why the ratio and the
 * z-score are the figures, not the raw percentage.
 */
export function deliveryAnomaly(today: number, trailing: readonly number[]): DeliveryAnomaly {
  const clean = trailing.filter((v) => Number.isFinite(v));
  const n = clean.length;
  if (n === 0 || !Number.isFinite(today)) {
    return { ratio: null, delta: null, zScore: null, trailingSessions: n };
  }
  const mean = clean.reduce((sum, v) => sum + v, 0) / n;
  const ratio = mean > 0 ? today / mean : null;
  const delta = today - mean;
  let zScore: number | null = null;
  if (n >= MIN_SESSIONS_FOR_Z) {
    const variance = clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
    const stdev = Math.sqrt(variance);
    zScore = stdev > 0 ? delta / stdev : null;
  }
  return { ratio, delta, zScore, trailingSessions: n };
}

// ---------------------------------------------------------------------------
// Attention score
// ---------------------------------------------------------------------------

/** One contributor to a stock's attention score. */
export interface AttentionFactor {
  readonly id: 'delivery' | 'oi' | 'deals' | 'volume';
  readonly label: string;
  /** The raw reading the factor was scored on, for the chip's tooltip. */
  readonly reading: string;
  /** 0–1 after clamping. */
  readonly contribution: number;
  /** Accumulation vs distribution, when the factor has a direction. */
  readonly tone: 'positive' | 'negative' | 'neutral';
}

export interface AttentionInput {
  /** Today's delivery % vs its trailing history. */
  readonly delivery: DeliveryAnomaly | null;
  /** Today's traded quantity ÷ trailing mean quantity. */
  readonly volumeRatio: number | null;
  /** Futures OI change as a fraction of the previous OI, with its label. */
  readonly oi: { readonly changeFraction: number; readonly buildup: OiBuildup | null } | null;
  /** Net bulk/block deal value ÷ the session's turnover, both paise. */
  readonly deals: {
    readonly netPaise: number;
    readonly turnoverPaise: number;
    readonly count: number;
  } | null;
}

export interface AttentionScore {
  /** Sum of contributions, 0–4. Ordering only — never a probability. */
  readonly score: number;
  readonly factors: readonly AttentionFactor[];
}

/** Score thresholds: the reading at which a factor contributes fully. */
export const ATTENTION_CAPS = {
  /** Delivery z-score of 2 (or ratio 2×) is a full contribution. */
  deliveryZ: 2,
  deliveryRatio: 2,
  /** A 10 % one-session OI change is a full contribution. */
  oiChangeFraction: 0.1,
  /** Deals worth 5 % of the session's turnover is a full contribution. */
  dealsShareOfTurnover: 0.05,
  /** 3× average volume is a full contribution. */
  volumeRatio: 3,
} as const;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function pct(v: number, digits = 0): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

/**
 * A transparent ranking score.
 *
 * Each factor contributes 0–1 by a linear ramp to its cap; the score is the
 * plain sum. There are no weights to tune and no hidden term, so a reader can
 * reproduce the number from the chips. Factors with no data are omitted, not
 * scored as zero — absent is not "nothing happened".
 */
export function attentionScore(input: AttentionInput): AttentionScore {
  const factors: AttentionFactor[] = [];

  const delivery = input.delivery;
  if (delivery !== null && (delivery.zScore !== null || delivery.ratio !== null)) {
    // Prefer the z-score once there is enough history; fall back to the ratio.
    const byZ = delivery.zScore === null ? null : delivery.zScore / ATTENTION_CAPS.deliveryZ;
    const byRatio =
      delivery.ratio === null ? null : (delivery.ratio - 1) / (ATTENTION_CAPS.deliveryRatio - 1);
    const raw = byZ ?? byRatio ?? 0;
    const contribution = clamp01(raw);
    const reading =
      delivery.delta === null
        ? '—'
        : `${delivery.delta >= 0 ? '+' : ''}${delivery.delta.toFixed(1)} pts vs ${delivery.trailingSessions}-session avg`;
    factors.push({
      id: 'delivery',
      label: 'Delivery',
      reading,
      contribution,
      tone:
        (delivery.delta ?? 0) > 0 ? 'positive' : (delivery.delta ?? 0) < 0 ? 'negative' : 'neutral',
    });
  }

  if (input.oi !== null && Number.isFinite(input.oi.changeFraction)) {
    const contribution = clamp01(
      Math.abs(input.oi.changeFraction) / ATTENTION_CAPS.oiChangeFraction,
    );
    factors.push({
      id: 'oi',
      label: 'Futures OI',
      reading: `${pct(input.oi.changeFraction * 100, 1)} OI`,
      contribution,
      tone: input.oi.buildup === null ? 'neutral' : buildupTone(input.oi.buildup),
    });
  }

  if (input.deals !== null && input.deals.count > 0 && input.deals.turnoverPaise > 0) {
    const share = Math.abs(input.deals.netPaise) / input.deals.turnoverPaise;
    const contribution = clamp01(share / ATTENTION_CAPS.dealsShareOfTurnover);
    factors.push({
      id: 'deals',
      label: 'Deals',
      reading: `${input.deals.count} ${input.deals.count === 1 ? 'deal' : 'deals'}, ${pct(share * 100, 1)} of turnover`,
      contribution,
      tone:
        input.deals.netPaise > 0 ? 'positive' : input.deals.netPaise < 0 ? 'negative' : 'neutral',
    });
  }

  if (input.volumeRatio !== null && Number.isFinite(input.volumeRatio) && input.volumeRatio > 0) {
    const contribution = clamp01((input.volumeRatio - 1) / (ATTENTION_CAPS.volumeRatio - 1));
    factors.push({
      id: 'volume',
      label: 'Volume',
      reading: `${input.volumeRatio.toFixed(1)}× average`,
      contribution,
      tone: 'neutral',
    });
  }

  const score = factors.reduce((sum, f) => sum + f.contribution, 0);
  return { score: Math.round(score * 1000) / 1000, factors };
}
