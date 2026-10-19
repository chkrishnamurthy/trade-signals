import type { MarketConditionLabel } from './types';

/** The persisted breadth values needed to describe one completed session. */
export interface BreadthSummaryInput {
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  readonly above20Pct: number | null;
  readonly above50Pct: number | null;
  readonly above200Pct: number | null;
  readonly newHighs: number;
  readonly newLows: number;
}

export interface BreadthMarketRead {
  readonly label: MarketConditionLabel;
  readonly headline: string;
}

const phrase: Record<MarketConditionLabel, string> = {
  bullish: 'Market participation was bullish',
  bearish: 'Market participation was bearish',
  mixed: 'Market participation was mixed',
  transitional: 'Market participation was transitional',
  insufficient_data: 'There was not enough completed breadth data to classify the market',
};

const tilt = (value: number | null): number | null =>
  value === null || !Number.isFinite(value) ? null : value / 50 - 1;

/**
 * A role-independent market read built only from the selected breadth universe.
 * It consumes persisted, closed-session aggregates and exposes no confidence
 * score: the sentence itself names the measured evidence.
 */
export function buildBreadthMarketRead(input: BreadthSummaryInput | null): BreadthMarketRead {
  if (input === null) {
    return { label: 'insufficient_data', headline: `${phrase.insufficient_data}.` };
  }

  const directional = input.advances + input.declines;
  const advanceTilt = directional === 0 ? null : (input.advances / directional) * 2 - 1;
  const shortTilt = tilt(input.above20Pct);
  const mediumTilt = tilt(input.above50Pct);
  const longTilt = tilt(input.above200Pct);
  const highLowTotal = input.newHighs + input.newLows;
  const highLowTilt = highLowTotal === 0 ? null : (input.newHighs - input.newLows) / highLowTotal;
  const components = [advanceTilt, shortTilt, mediumTilt, longTilt, highLowTilt].filter(
    (value): value is number => value !== null,
  );

  if (directional === 0 || components.length < 3) {
    return { label: 'insufficient_data', headline: `${phrase.insufficient_data}.` };
  }

  const score = components.reduce((sum, value) => sum + value, 0) / components.length;
  const shortComponents = [advanceTilt, shortTilt].filter(
    (value): value is number => value !== null,
  );
  const shortScore =
    shortComponents.length === 0
      ? 0
      : shortComponents.reduce((sum, value) => sum + value, 0) / shortComponents.length;

  let label: MarketConditionLabel;
  if (
    longTilt !== null &&
    ((shortScore >= 0.1 && longTilt <= -0.1) || (shortScore <= -0.1 && longTilt >= 0.1))
  ) {
    label = 'transitional';
  } else if (score >= 0.25) {
    label = 'bullish';
  } else if (score <= -0.25) {
    label = 'bearish';
  } else if (Math.abs(score) >= 0.12) {
    label = 'transitional';
  } else {
    label = 'mixed';
  }

  const advanceShare = ((input.advances / directional) * 100).toFixed(0);
  const longTerm =
    input.above200Pct === null
      ? ''
      : `, while ${input.above200Pct.toFixed(1)}% held above their 200-day EMA`;
  const extremes =
    highLowTotal === 0
      ? ''
      : `; ${input.newHighs} stocks made new 52-week highs versus ${input.newLows} new lows`;

  return {
    label,
    headline: `${phrase[label]}. ${advanceShare}% of directionally moving stocks advanced${longTerm}${extremes}.`,
  };
}
