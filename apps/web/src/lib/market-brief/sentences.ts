/**
 * Deterministic sentence generation for the Daily Market Brief.
 *
 * Templates, never a generative model (the task and CLAUDE.md both forbid an
 * LLM here). Every sentence is a pure function of measured facts, with correct
 * singular/plural grammar and no count printed without its denominator. No
 * sentence predicts, promises profit, or invents a cause for a move.
 */

import type { ChangeEventType, MarketConditionLabel, SessionInstrumentFacts } from './types';

/** "1 stock" / "2 stocks" — count with a correctly-pluralised noun. */
export function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "3 of 50" — a count always shown against the denominator it belongs to. */
export function outOf(count: number, total: number): string {
  return `${count} of ${total}`;
}

/** A signed percent to one decimal, e.g. "+1.2%" / "-0.4%" / "0.0%". */
export function signedPercent(value: number): string {
  const rounded = value.toFixed(1);
  // Intl gives "-0.0" for tiny negatives; normalise so the sign never lies.
  const normalised = rounded === '-0.0' ? '0.0' : rounded;
  const sign = value > 0 && !normalised.startsWith('-') ? '+' : '';
  return `${sign}${normalised}%`;
}

const CONDITION_PHRASE: Record<MarketConditionLabel, string> = {
  bullish: 'Market conditions were bullish',
  bearish: 'Market conditions were bearish',
  mixed: 'Market conditions were mixed',
  transitional: 'Market conditions were transitional',
  insufficient_data: 'There was not enough completed data to describe market conditions',
};

export function conditionPhrase(label: MarketConditionLabel): string {
  return CONDITION_PHRASE[label];
}

/**
 * The one-line headline.
 *
 * "Market conditions were mixed. 29 of 50 stocks advanced, 32 held above their
 * 20-day average, and 5 new bullish setups were detected."
 */
export function headlineSentence(input: {
  label: MarketConditionLabel;
  advances: number;
  directionCovered: number;
  above20: number | null;
  above20Total: number | null;
  newBullishSetups: number;
}): string {
  const lead = conditionPhrase(input.label);
  if (input.label === 'insufficient_data' || input.directionCovered === 0) {
    return `${lead}.`;
  }

  const clauses: string[] = [`${outOf(input.advances, input.directionCovered)} stocks advanced`];

  if (input.above20 !== null && input.above20Total !== null && input.above20Total > 0) {
    clauses.push(`${input.above20} held above their 20-day average`);
  }

  const setups = input.newBullishSetups;
  clauses.push(
    setups === 1
      ? '1 new bullish setup was detected'
      : `${setups} new bullish setups were detected`,
  );

  return `${lead}. ${joinClauses(clauses)}.`;
}

/** Oxford-comma join: "a", "a and b", "a, b, and c". */
export function joinClauses(clauses: readonly string[]): string {
  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0] ?? '';
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

/**
 * The market-condition explanation.
 *
 * "32 of 50 stocks closed above their 20-day average, while advancing and
 * declining stocks were nearly balanced."
 */
export function conditionExplanation(input: {
  label: MarketConditionLabel;
  advances: number;
  declines: number;
  directionCovered: number;
  above20: number | null;
  above20Total: number | null;
  above50: number | null;
  above50Total: number | null;
  availableInstruments: number;
  expectedInstruments: number;
}): string {
  if (input.label === 'insufficient_data') {
    return `Only ${outOf(input.availableInstruments, input.expectedInstruments)} instruments had completed data for this session — too few to classify market breadth.`;
  }

  const clauses: string[] = [];

  if (input.above20 !== null && input.above20Total !== null && input.above20Total > 0) {
    clauses.push(
      `${outOf(input.above20, input.above20Total)} stocks closed above their 20-day average`,
    );
  }
  if (input.above50 !== null && input.above50Total !== null && input.above50Total > 0) {
    clauses.push(`${outOf(input.above50, input.above50Total)} closed above their 50-day average`);
  }

  clauses.push(breadthClause(input.advances, input.declines));

  const sentence = joinClauses(clauses);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function breadthClause(advances: number, declines: number): string {
  const total = advances + declines;
  if (total === 0) return 'no stocks recorded a directional move';
  const ratio = advances / total;
  if (ratio >= 0.45 && ratio <= 0.55) {
    return 'advancing and declining stocks were nearly balanced';
  }
  if (advances > declines) {
    return `advancing stocks (${advances}) outnumbered declining stocks (${declines})`;
  }
  return `declining stocks (${declines}) outnumbered advancing stocks (${advances})`;
}

const EVENT_TEMPLATES: Record<ChangeEventType, (facts: SessionInstrumentFacts) => string> = {
  new_bullish_setup: () => 'A new bullish setup appeared this session.',
  new_bearish_setup: () => 'A new bearish setup appeared this session.',
  bullish_invalidated: () => 'A previous bullish setup was invalidated.',
  bearish_invalidated: () => 'A previous bearish setup was invalidated.',
  crossed_above_ma20: () => 'Price crossed above its 20-day moving average.',
  crossed_below_ma20: () => 'Price crossed below its 20-day moving average.',
  crossed_above_ma50: () => 'Price crossed above its 50-day moving average.',
  crossed_below_ma50: () => 'Price crossed below its 50-day moving average.',
  momentum_strengthened: () => 'Momentum strengthened — MACD histogram turned positive.',
  momentum_weakened: () => 'Momentum weakened — MACD histogram turned negative.',
  unusual_volume: (facts) =>
    facts.relativeVolume === null
      ? 'Unusual trading volume was recorded.'
      : `Unusual trading volume — ${facts.relativeVolume.toFixed(1)}× the 20-day average.`,
  breakout_appeared: () => 'Price broke out above its recent range.',
  breakdown_appeared: () => 'Price broke down below its recent range.',
};

export function eventExplanation(
  eventType: ChangeEventType,
  facts: SessionInstrumentFacts,
): string {
  return EVENT_TEMPLATES[eventType](facts);
}
