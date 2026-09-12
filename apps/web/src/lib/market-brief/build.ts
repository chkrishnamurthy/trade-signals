/**
 * The pure Daily Market Brief builder.
 *
 * Data + config in, a fully-formed {@link DailyMarketBrief} out. This module is
 * PURE (CLAUDE.md hard rule 1 applied to the read model): no database, no
 * network, no `process.env`, no module-level mutable state, and no `Date.now()`
 * — the clock arrives as `input.now`. That is what makes every classification
 * branch and every generated sentence unit-testable against fixed fixtures.
 *
 * It never recomputes an indicator or a signal (hard rule 8): it reads what the
 * worker persisted and aggregates it. Prices stay in integer paise; formatting
 * to rupees happens only in React via `formatPaise()`.
 */

import { istMinutesOfDay, istParts } from '@equitywise/shared';
import {
  conditionExplanation,
  eventExplanation,
  headlineSentence,
  signedPercent,
} from './sentences';
import { DEFAULT_BRIEF_THRESHOLDS, type MarketBriefThresholds } from './thresholds';
import type {
  AttentionFactorDto,
  AttentionItemDto,
  AttentionLevel,
  BriefDirection,
  BriefStatus,
  ChangeEventDto,
  ChangeEventType,
  DailyMarketBrief,
  MarketBriefInput,
  MarketConditionDto,
  MarketConditionFactor,
  MarketConditionLabel,
  OverviewDto,
  SessionInstrumentFacts,
  SessionSignalFacts,
  SetupListsDto,
  SetupRowDto,
  WatchlistBriefDto,
  WatchlistBriefItemDto,
} from './types';

const DISCLAIMER =
  'Technical observations based on completed market data. Setup strength is not a probability of profit or investment advice.';

/** After this IST minute the day's end-of-day pass is expected to have run. */
const SESSION_COMPLETE_MINUTE = 17 * 60;

type DirectionCategory = 'bullish' | 'bearish' | 'neutral';

function categoryOf(direction: BriefDirection): DirectionCategory {
  if (direction === 'strong_bullish' || direction === 'bullish') return 'bullish';
  if (direction === 'strong_bearish' || direction === 'bearish') return 'bearish';
  return 'neutral';
}

/** Event salience, lowest number = most salient. Drives ordering. */
const EVENT_PRIORITY: Record<ChangeEventType, number> = {
  new_bullish_setup: 1,
  new_bearish_setup: 1,
  breakout_appeared: 2,
  breakdown_appeared: 2,
  crossed_above_ma50: 3,
  crossed_below_ma50: 3,
  crossed_above_ma20: 4,
  crossed_below_ma20: 4,
  momentum_strengthened: 5,
  momentum_weakened: 5,
  bullish_invalidated: 6,
  bearish_invalidated: 6,
  unusual_volume: 7,
};

const BULLISH_EVENTS: ReadonlySet<ChangeEventType> = new Set([
  'new_bullish_setup',
  'breakout_appeared',
  'crossed_above_ma50',
  'crossed_above_ma20',
  'momentum_strengthened',
  'bearish_invalidated',
]);
const BEARISH_EVENTS: ReadonlySet<ChangeEventType> = new Set([
  'new_bearish_setup',
  'breakdown_appeared',
  'crossed_below_ma50',
  'crossed_below_ma20',
  'momentum_weakened',
  'bullish_invalidated',
]);

function eventDirection(eventType: ChangeEventType): 'bullish' | 'bearish' | 'neutral' | null {
  if (BULLISH_EVENTS.has(eventType)) return 'bullish';
  if (BEARISH_EVENTS.has(eventType)) return 'bearish';
  return null;
}

export function buildMarketBrief(
  input: MarketBriefInput,
  thresholds: MarketBriefThresholds = DEFAULT_BRIEF_THRESHOLDS,
): DailyMarketBrief {
  const instruments = [...input.current.values()].sort((a, b) =>
    a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0,
  );
  const availableInstruments = instruments.length;

  const breadth = computeBreadth(instruments, thresholds);
  const setupCounts = computeNewSetupCounts(input);
  const events = detectEvents(input, thresholds);

  const overview: OverviewDto = {
    indexName: input.indexName,
    indexReturnPercent: input.indexReturnPercent,
    advances: breadth.advances,
    declines: breadth.declines,
    unchanged: breadth.unchanged,
    directionCovered: breadth.directionCovered,
    above20DayAverage: breadth.above20,
    above20DayTotal: breadth.sma20Total,
    above50DayAverage: breadth.above50,
    above50DayTotal: breadth.sma50Total,
    newBullishSetups: setupCounts.bullish,
    newBearishSetups: setupCounts.bearish,
  };

  const condition = classifyMarket({
    availableInstruments,
    expectedInstruments: input.expectedInstruments,
    breadth,
    signalCategories: signalCategoryCounts(input.currentSignals),
    thresholds,
  });

  const headline = headlineSentence({
    label: condition.label,
    advances: breadth.advances,
    directionCovered: breadth.directionCovered,
    above20: breadth.above20,
    above20Total: breadth.sma20Total,
    newBullishSetups: setupCounts.bullish,
  });

  const attention = rankAttention(input, events, thresholds);
  const setups = buildSetupLists(input, thresholds);
  const watchlists = buildWatchlistBrief(input, events, thresholds);

  const sessionsBehind = countSessionsBehind(input.sessionDate, input.now);
  const status = resolveStatus({
    availableInstruments,
    expectedInstruments: input.expectedInstruments,
    sessionsBehind,
    thresholds,
  });

  return {
    session: {
      sessionDate: input.sessionDate,
      previousSessionDate: input.previousSessionDate,
      completedAt: input.completedAt,
      status,
      availableInstruments,
      expectedInstruments: input.expectedInstruments,
      sessionsBehind,
    },
    headline,
    marketCondition: condition,
    overview,
    changes: events.slice(0, thresholds.maxChanges).map((event) => event.dto),
    attention,
    watchlists,
    setups,
    disclaimer: DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// Breadth
// ---------------------------------------------------------------------------

interface Breadth {
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  readonly directionCovered: number;
  readonly above20: number | null;
  readonly sma20Total: number | null;
  readonly above50: number | null;
  readonly sma50Total: number | null;
}

function computeBreadth(
  instruments: readonly SessionInstrumentFacts[],
  thresholds: MarketBriefThresholds,
): Breadth {
  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  let directionCovered = 0;
  let above20 = 0;
  let sma20Total = 0;
  let above50 = 0;
  let sma50Total = 0;

  for (const facts of instruments) {
    if (facts.changePercent !== null) {
      directionCovered += 1;
      if (facts.changePercent > thresholds.unchangedBandPercent) advances += 1;
      else if (facts.changePercent < -thresholds.unchangedBandPercent) declines += 1;
      else unchanged += 1;
    }
    if (facts.sma20 !== null) {
      sma20Total += 1;
      if (facts.close > facts.sma20) above20 += 1;
    }
    if (facts.sma50 !== null) {
      sma50Total += 1;
      if (facts.close > facts.sma50) above50 += 1;
    }
  }

  return {
    advances,
    declines,
    unchanged,
    directionCovered,
    // Never report a count against a zero denominator — that reads as "0 above"
    // when the truth is "we have no moving-average data".
    above20: sma20Total === 0 ? null : above20,
    sma20Total: sma20Total === 0 ? null : sma20Total,
    above50: sma50Total === 0 ? null : above50,
    sma50Total: sma50Total === 0 ? null : sma50Total,
  };
}

// ---------------------------------------------------------------------------
// Setup counts & signal categories
// ---------------------------------------------------------------------------

function computeNewSetupCounts(input: MarketBriefInput): { bullish: number; bearish: number } {
  let bullish = 0;
  let bearish = 0;
  for (const [instrumentId, signal] of input.currentSignals) {
    const current = categoryOf(signal.direction);
    const prior = input.previousSignals.get(instrumentId);
    const previous = prior === undefined ? 'neutral' : categoryOf(prior.direction);
    if (current === 'bullish' && previous !== 'bullish') bullish += 1;
    if (current === 'bearish' && previous !== 'bearish') bearish += 1;
  }
  return { bullish, bearish };
}

function signalCategoryCounts(signals: ReadonlyMap<number, SessionSignalFacts>): {
  bullish: number;
  bearish: number;
  total: number;
} {
  let bullish = 0;
  let bearish = 0;
  for (const signal of signals.values()) {
    const category = categoryOf(signal.direction);
    if (category === 'bullish') bullish += 1;
    else if (category === 'bearish') bearish += 1;
  }
  return { bullish, bearish, total: signals.size };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classifyMarket(args: {
  availableInstruments: number;
  expectedInstruments: number;
  breadth: Breadth;
  signalCategories: { bullish: number; bearish: number; total: number };
  thresholds: MarketBriefThresholds;
}): MarketConditionDto {
  const { availableInstruments, expectedInstruments, breadth, signalCategories, thresholds } = args;

  const coverage = expectedInstruments === 0 ? 0 : availableInstruments / expectedInstruments;

  // Each component maps a fraction to a −1…+1 tilt; only available ones count.
  const components: { id: string; value: number }[] = [];
  const advTotal = breadth.advances + breadth.declines;
  if (advTotal > 0) {
    components.push({ id: 'advancing', value: (breadth.advances / advTotal) * 2 - 1 });
  }
  if (breadth.above20 !== null && breadth.sma20Total !== null && breadth.sma20Total > 0) {
    components.push({ id: 'above20', value: (breadth.above20 / breadth.sma20Total) * 2 - 1 });
  }
  const longTerm =
    breadth.above50 !== null && breadth.sma50Total !== null && breadth.sma50Total > 0
      ? (breadth.above50 / breadth.sma50Total) * 2 - 1
      : null;
  if (longTerm !== null) components.push({ id: 'above50', value: longTerm });
  if (signalCategories.total > 0) {
    components.push({
      id: 'setups',
      value: (signalCategories.bullish - signalCategories.bearish) / signalCategories.total,
    });
  }

  const factors = buildConditionFactors(breadth, signalCategories);

  if (coverage < thresholds.coverageFloor || components.length < thresholds.minComponents) {
    return {
      label: 'insufficient_data',
      explanation: conditionExplanation({
        label: 'insufficient_data',
        advances: breadth.advances,
        declines: breadth.declines,
        directionCovered: breadth.directionCovered,
        above20: breadth.above20,
        above20Total: breadth.sma20Total,
        above50: breadth.above50,
        above50Total: breadth.sma50Total,
        availableInstruments,
        expectedInstruments,
      }),
      factors,
    };
  }

  const score = components.reduce((sum, c) => sum + c.value, 0) / components.length;
  const shortTerm = components
    .filter((c) => c.id === 'advancing' || c.id === 'above20')
    .reduce((sum, c, _i, arr) => (arr.length === 0 ? 0 : sum + c.value / arr.length), 0);

  const label = decideLabel({ score, shortTerm, longTerm, thresholds });

  return {
    label,
    explanation: conditionExplanation({
      label,
      advances: breadth.advances,
      declines: breadth.declines,
      directionCovered: breadth.directionCovered,
      above20: breadth.above20,
      above20Total: breadth.sma20Total,
      above50: breadth.above50,
      above50Total: breadth.sma50Total,
      availableInstruments,
      expectedInstruments,
    }),
    factors,
  };
}

function decideLabel(args: {
  score: number;
  shortTerm: number;
  longTerm: number | null;
  thresholds: MarketBriefThresholds;
}): MarketConditionLabel {
  const { score, shortTerm, longTerm, thresholds } = args;
  const tilt = thresholds.componentTilt;

  // Short-term and long-term breadth pointing opposite ways is the textbook
  // "market changing character" — a bounce not yet a trend, or a leader rolling
  // over — and is reported as transitional regardless of the averaged score.
  if (longTerm !== null && Math.abs(score) >= thresholds.transitionalScore) {
    if (shortTerm >= tilt && longTerm <= -tilt) return 'transitional';
    if (shortTerm <= -tilt && longTerm >= tilt) return 'transitional';
  }

  if (score >= thresholds.bullishScore && (longTerm === null || longTerm >= -tilt))
    return 'bullish';
  if (score <= thresholds.bearishScore && (longTerm === null || longTerm <= tilt)) return 'bearish';
  if (Math.abs(score) >= thresholds.transitionalScore) return 'transitional';
  return 'mixed';
}

function buildConditionFactors(
  breadth: Breadth,
  signalCategories: { bullish: number; bearish: number; total: number },
): MarketConditionFactor[] {
  const factors: MarketConditionFactor[] = [];
  const advTotal = breadth.advances + breadth.declines;

  factors.push({
    id: 'advancing',
    label: 'Advancing stocks',
    value: advTotal === 0 ? '—' : `${Math.round((breadth.advances / advTotal) * 100)}%`,
    availableCount: breadth.advances,
    totalCount: breadth.directionCovered,
  });
  if (breadth.above20 !== null && breadth.sma20Total !== null) {
    factors.push({
      id: 'above20',
      label: 'Above 20-day average',
      value: `${Math.round((breadth.above20 / Math.max(1, breadth.sma20Total)) * 100)}%`,
      availableCount: breadth.above20,
      totalCount: breadth.sma20Total,
    });
  }
  if (breadth.above50 !== null && breadth.sma50Total !== null) {
    factors.push({
      id: 'above50',
      label: 'Above 50-day average',
      value: `${Math.round((breadth.above50 / Math.max(1, breadth.sma50Total)) * 100)}%`,
      availableCount: breadth.above50,
      totalCount: breadth.sma50Total,
    });
  }
  factors.push({
    id: 'setups',
    label: 'Bullish vs bearish setups',
    value: `${signalCategories.bullish} / ${signalCategories.bearish}`,
    availableCount: signalCategories.bullish + signalCategories.bearish,
    totalCount: signalCategories.total,
  });

  return factors;
}

// ---------------------------------------------------------------------------
// What changed today
// ---------------------------------------------------------------------------

interface DetectedEvent {
  readonly instrumentId: number;
  readonly eventType: ChangeEventType;
  readonly priority: number;
  readonly facts: SessionInstrumentFacts;
  readonly dto: ChangeEventDto;
}

function detectEvents(
  input: MarketBriefInput,
  _thresholds: MarketBriefThresholds,
): DetectedEvent[] {
  const events: DetectedEvent[] = [];

  const add = (facts: SessionInstrumentFacts, eventType: ChangeEventType): void => {
    events.push({
      instrumentId: facts.instrumentId,
      eventType,
      priority: EVENT_PRIORITY[eventType],
      facts,
      dto: {
        instrumentId: facts.instrumentId,
        symbol: facts.symbol,
        name: facts.name,
        eventType,
        direction: eventDirection(eventType),
        explanation: eventExplanation(eventType, facts),
        closePaise: facts.close,
        sessionReturn: facts.changePercent,
        watchlists: input.watchlistMembership.get(facts.instrumentId) ?? [],
      },
    });
  };

  for (const facts of input.current.values()) {
    const prev = input.previous.get(facts.instrumentId);
    const signal = input.currentSignals.get(facts.instrumentId);
    const prevSignal = input.previousSignals.get(facts.instrumentId);

    // --- Signal category transitions ---
    if (signal !== undefined) {
      const current = categoryOf(signal.direction);
      const previous = prevSignal === undefined ? 'neutral' : categoryOf(prevSignal.direction);
      if (current === 'bullish' && previous !== 'bullish') add(facts, 'new_bullish_setup');
      if (current === 'bearish' && previous !== 'bearish') add(facts, 'new_bearish_setup');
      if (previous === 'bullish' && current !== 'bullish') add(facts, 'bullish_invalidated');
      if (previous === 'bearish' && current !== 'bearish') add(facts, 'bearish_invalidated');

      // --- Range breakout / breakdown from the stored setups ---
      const hadBreakout = prevSignal?.setups.includes('Breakout') ?? false;
      const hadBreakdown = prevSignal?.setups.includes('Breakdown') ?? false;
      if (signal.setups.includes('Breakout') && !hadBreakout) add(facts, 'breakout_appeared');
      if (signal.setups.includes('Breakdown') && !hadBreakdown) add(facts, 'breakdown_appeared');
    }

    // --- Moving-average crossings (needs both sessions) ---
    if (prev !== undefined) {
      addCross(add, facts, prev, 'sma20', 'crossed_above_ma20', 'crossed_below_ma20');
      addCross(add, facts, prev, 'sma50', 'crossed_above_ma50', 'crossed_below_ma50');

      // --- Momentum flip on the MACD histogram ---
      if (prev.macdHistogram !== null && facts.macdHistogram !== null) {
        if (prev.macdHistogram <= 0 && facts.macdHistogram > 0) add(facts, 'momentum_strengthened');
        if (prev.macdHistogram >= 0 && facts.macdHistogram < 0) add(facts, 'momentum_weakened');
      }
    }

    // --- Unusual volume (baseline present) ---
    if (facts.relativeVolume !== null && facts.relativeVolume >= _thresholds.unusualVolume) {
      add(facts, 'unusual_volume');
    }
  }

  return sortEvents(events);
}

function addCross(
  add: (facts: SessionInstrumentFacts, eventType: ChangeEventType) => void,
  facts: SessionInstrumentFacts,
  prev: SessionInstrumentFacts,
  field: 'sma20' | 'sma50',
  aboveEvent: ChangeEventType,
  belowEvent: ChangeEventType,
): void {
  const prevMa = prev[field];
  const curMa = facts[field];
  if (prevMa === null || curMa === null) return;
  if (prev.close <= prevMa && facts.close > curMa) add(facts, aboveEvent);
  else if (prev.close >= prevMa && facts.close < curMa) add(facts, belowEvent);
}

function sortEvents(events: readonly DetectedEvent[]): DetectedEvent[] {
  return [...events].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ra = Math.abs(a.facts.changePercent ?? 0);
    const rb = Math.abs(b.facts.changePercent ?? 0);
    if (ra !== rb) return rb - ra;
    return a.facts.symbol < b.facts.symbol ? -1 : a.facts.symbol > b.facts.symbol ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Attention
// ---------------------------------------------------------------------------

function rankAttention(
  input: MarketBriefInput,
  events: readonly DetectedEvent[],
  thresholds: MarketBriefThresholds,
): AttentionItemDto[] {
  const eventsByInstrument = new Map<number, DetectedEvent[]>();
  for (const event of events) {
    const list = eventsByInstrument.get(event.instrumentId) ?? [];
    list.push(event);
    eventsByInstrument.set(event.instrumentId, list);
  }

  const items: AttentionItemDto[] = [];
  const w = thresholds.attentionWeights;

  for (const facts of input.current.values()) {
    const signal = input.currentSignals.get(facts.instrumentId);
    const prevSignal = input.previousSignals.get(facts.instrumentId);
    const instrumentEvents = eventsByInstrument.get(facts.instrumentId) ?? [];
    const membership = input.watchlistMembership.get(facts.instrumentId) ?? [];

    const factors: AttentionFactorDto[] = [];
    const push = (id: string, label: string, contribution: number, explanation: string): void => {
      if (contribution > 0) factors.push({ id, label, contribution, explanation });
    };

    if (signal !== undefined && prevSignal === undefined) {
      push('newSignal', 'New signal', w.newSignal, 'A signal was recorded for the first time.');
    }
    if (signal !== undefined && prevSignal !== undefined) {
      if (categoryOf(signal.direction) !== categoryOf(prevSignal.direction)) {
        push(
          'directionChanged',
          'Direction changed',
          w.directionChanged,
          'The signal direction changed from the previous session.',
        );
      }
    }
    if (
      instrumentEvents.some(
        (e) => e.eventType === 'breakout_appeared' || e.eventType === 'breakdown_appeared',
      )
    ) {
      push(
        'breakoutOrBreakdown',
        'Breakout / breakdown',
        w.breakoutOrBreakdown,
        'Price left its recent range.',
      );
    }
    if (facts.relativeVolume !== null && facts.relativeVolume >= thresholds.abnormalVolume) {
      push(
        'abnormalVolume',
        'Abnormal volume',
        w.abnormalVolume,
        `Volume was ${facts.relativeVolume.toFixed(1)}× the 20-day average.`,
      );
    }
    if (instrumentEvents.some((e) => e.eventType.startsWith('crossed_'))) {
      push(
        'maTransition',
        'Moving-average transition',
        w.maTransition,
        'Price crossed a tracked moving average.',
      );
    }
    if (
      instrumentEvents.some(
        (e) => e.eventType === 'momentum_strengthened' || e.eventType === 'momentum_weakened',
      )
    ) {
      push('momentumFlip', 'Momentum shift', w.momentumFlip, 'The MACD histogram changed sign.');
    }
    if (signal !== undefined && (signal.strength >= 70 || signal.strength <= 30)) {
      push(
        'alignedStrength',
        'Aligned factors',
        w.alignedStrength,
        `Multiple factors align (setup strength ${signal.strength}/100).`,
      );
    }
    if (membership.length > 0) {
      push(
        'inWatchlist',
        'On your watchlist',
        w.inWatchlist,
        'This name is on one of your watchlists.',
      );
    }

    const score = factors.reduce((sum, f) => sum + f.contribution, 0);
    if (score <= 0) continue;

    items.push({
      instrumentId: facts.instrumentId,
      symbol: facts.symbol,
      name: facts.name,
      level: attentionLevel(score, thresholds),
      score,
      direction: signal?.direction ?? null,
      closePaise: facts.close,
      sessionReturn: facts.changePercent,
      factors,
      signalFactors: signal?.factors ?? [],
      watchlists: membership,
    });
  }

  return items
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const ra = Math.abs(a.sessionReturn ?? 0);
      const rb = Math.abs(b.sessionReturn ?? 0);
      if (ra !== rb) return rb - ra;
      return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
    })
    .slice(0, thresholds.maxAttention);
}

function attentionLevel(score: number, thresholds: MarketBriefThresholds): AttentionLevel {
  if (score >= thresholds.attentionHigh) return 'high';
  if (score >= thresholds.attentionMedium) return 'medium';
  return 'monitor';
}

// ---------------------------------------------------------------------------
// Setup lists
// ---------------------------------------------------------------------------

function buildSetupLists(
  input: MarketBriefInput,
  thresholds: MarketBriefThresholds,
): SetupListsDto {
  const bullish: SetupRowDto[] = [];
  const bearish: SetupRowDto[] = [];
  const breakout: SetupRowDto[] = [];
  const breakdown: SetupRowDto[] = [];
  const unusualVolume: SetupRowDto[] = [];

  for (const facts of input.current.values()) {
    const signal = input.currentSignals.get(facts.instrumentId);
    const membership = input.watchlistMembership.get(facts.instrumentId) ?? [];
    const category = signal === undefined ? 'neutral' : categoryOf(signal.direction);

    const base = (explanation: string): SetupRowDto => ({
      instrumentId: facts.instrumentId,
      symbol: facts.symbol,
      name: facts.name,
      direction: signal?.direction ?? null,
      closePaise: facts.close,
      sessionReturn: facts.changePercent,
      strength: signal?.strength ?? null,
      relativeVolume: facts.relativeVolume,
      explanation,
      signalFactors: signal?.factors ?? [],
      watchlists: membership,
    });

    if (category === 'bullish') bullish.push(base(setupExplanation(signal, 'bullish')));
    if (category === 'bearish') bearish.push(base(setupExplanation(signal, 'bearish')));
    if (signal?.setups.includes('Breakout') === true) {
      breakout.push(base('Closed above its recent trading range.'));
    }
    if (signal?.setups.includes('Breakdown') === true) {
      breakdown.push(base('Closed below its recent trading range.'));
    }
    if (facts.relativeVolume !== null && facts.relativeVolume >= thresholds.unusualVolume) {
      unusualVolume.push(base(`${facts.relativeVolume.toFixed(1)}× the 20-day average volume.`));
    }
  }

  const byStrengthDesc = (a: SetupRowDto, b: SetupRowDto): number =>
    (b.strength ?? 0) - (a.strength ?? 0) || symbolOrder(a, b);
  const byStrengthAsc = (a: SetupRowDto, b: SetupRowDto): number =>
    (a.strength ?? 100) - (b.strength ?? 100) || symbolOrder(a, b);
  const byRelVolDesc = (a: SetupRowDto, b: SetupRowDto): number =>
    (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0) || symbolOrder(a, b);

  const cap = thresholds.maxSetupRows;
  return {
    bullish: bullish.sort(byStrengthDesc).slice(0, cap),
    bearish: bearish.sort(byStrengthAsc).slice(0, cap),
    breakout: breakout.sort(byStrengthDesc).slice(0, cap),
    breakdown: breakdown.sort(byStrengthAsc).slice(0, cap),
    unusualVolume: unusualVolume.sort(byRelVolDesc).slice(0, cap),
  };
}

function symbolOrder(a: { symbol: string }, b: { symbol: string }): number {
  return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
}

function setupExplanation(
  signal: SessionSignalFacts | undefined,
  category: 'bullish' | 'bearish',
): string {
  const named = (signal?.setups ?? []).slice(0, 2);
  if (named.length > 0) return `${named.join(', ')}.`;
  return category === 'bullish' ? 'Bullish technical alignment.' : 'Bearish technical alignment.';
}

// ---------------------------------------------------------------------------
// Watchlist brief
// ---------------------------------------------------------------------------

function buildWatchlistBrief(
  input: MarketBriefInput,
  events: readonly DetectedEvent[],
  thresholds: MarketBriefThresholds,
): WatchlistBriefDto {
  const watchedIds = new Set(input.watchlistMembership.keys());
  const watchedCount = watchedIds.size;

  // Most-salient event per watched instrument (events are already sorted).
  const bestByInstrument = new Map<number, DetectedEvent>();
  for (const event of events) {
    if (!watchedIds.has(event.instrumentId)) continue;
    if (!bestByInstrument.has(event.instrumentId)) bestByInstrument.set(event.instrumentId, event);
  }

  let newBullishCount = 0;
  let newBearishCount = 0;
  let strengthenedCount = 0;
  let invalidatedCount = 0;
  let transitionCount = 0;

  for (const instrumentId of watchedIds) {
    const instrumentEvents = events.filter((e) => e.instrumentId === instrumentId);
    for (const event of instrumentEvents) {
      switch (event.eventType) {
        case 'new_bullish_setup':
          newBullishCount += 1;
          break;
        case 'new_bearish_setup':
          newBearishCount += 1;
          break;
        case 'momentum_strengthened':
        case 'breakout_appeared':
          strengthenedCount += 1;
          break;
        case 'bullish_invalidated':
        case 'bearish_invalidated':
        case 'breakdown_appeared':
        case 'momentum_weakened':
          invalidatedCount += 1;
          break;
        case 'crossed_above_ma20':
        case 'crossed_below_ma20':
        case 'crossed_above_ma50':
        case 'crossed_below_ma50':
          transitionCount += 1;
          break;
        default:
          break;
      }
    }
  }

  const items: WatchlistBriefItemDto[] = [...bestByInstrument.values()]
    .map((event) => ({
      instrumentId: event.instrumentId,
      symbol: event.facts.symbol,
      name: event.facts.name,
      eventType: event.eventType,
      direction: event.dto.direction,
      explanation: event.dto.explanation,
      closePaise: event.facts.close,
      sessionReturn: event.facts.changePercent,
      watchlists: event.dto.watchlists,
    }))
    .sort((a, b) => {
      const pa = EVENT_PRIORITY[a.eventType];
      const pb = EVENT_PRIORITY[b.eventType];
      if (pa !== pb) return pa - pb;
      return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
    })
    .slice(0, thresholds.maxWatchlistItems);

  return {
    hasWatchlists: input.hasWatchlists,
    watchedCount,
    affectedCount: bestByInstrument.size,
    newBullishCount,
    newBearishCount,
    strengthenedCount,
    invalidatedCount,
    transitionCount,
    items,
  };
}

// ---------------------------------------------------------------------------
// Freshness / status
// ---------------------------------------------------------------------------

function resolveStatus(args: {
  availableInstruments: number;
  expectedInstruments: number;
  sessionsBehind: number;
  thresholds: MarketBriefThresholds;
}): BriefStatus {
  if (args.availableInstruments === 0) return 'unavailable';
  if (args.sessionsBehind > args.thresholds.staleSessionTolerance) return 'stale';
  if (args.availableInstruments < args.expectedInstruments) return 'partial';
  return 'complete';
}

/** The most recent session "now" would expect to be complete, as `YYYY-MM-DD`. */
export function expectedLatestSession(now: Date): string {
  const parts = istParts(now);
  let cursor = Date.UTC(parts.year, parts.month - 1, parts.day);
  const completeToday = isWeekdayUtc(cursor) && istMinutesOfDay(now) >= SESSION_COMPLETE_MINUTE;
  if (!completeToday) cursor -= DAY_MS;
  while (!isWeekdayUtc(cursor)) cursor -= DAY_MS;
  return dateKeyOfUtc(cursor);
}

/** Expected completed sessions between `sessionDate` (exclusive) and now (inclusive). */
export function countSessionsBehind(sessionDate: string, now: Date): number {
  const expected = expectedLatestSession(now);
  if (sessionDate >= expected) return 0;

  let cursor = utcOfDateKey(sessionDate) + DAY_MS;
  const end = utcOfDateKey(expected);
  let count = 0;
  let guard = 0;
  while (cursor <= end && guard < 60) {
    if (isWeekdayUtc(cursor)) count += 1;
    cursor += DAY_MS;
    guard += 1;
  }
  return count;
}

const DAY_MS = 86_400_000;

function isWeekdayUtc(utcMidnight: number): boolean {
  const day = new Date(utcMidnight).getUTCDay();
  return day >= 1 && day <= 5;
}

function dateKeyOfUtc(utcMidnight: number): string {
  return new Date(utcMidnight).toISOString().slice(0, 10);
}

function utcOfDateKey(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Re-export for the presentation layer's convenience. */
export { signedPercent };
