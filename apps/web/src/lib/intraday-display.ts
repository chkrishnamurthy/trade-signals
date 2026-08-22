import type {
  IntradaySignalDto,
  IntradaySignalState,
  SignalQuality,
  TradeDirection,
} from './intraday-types';
import { isLiveState, isTerminalState } from './intraday-types';

import type { Tone } from './tone';

/**
 * Display rules for intraday signals.
 *
 * Pure functions, no JSX, so the ordering and grouping used by the page can be
 * unit-tested and cannot drift from what the components render.
 *
 * One rule governs everything here: a signal that is over must never be
 * presented like one that is live. Sorting, grouping and tone all encode that.
 */

/** A long setup is bullish, a short one bearish. Terminal signals are muted. */
export function toneOfSignal(signal: IntradaySignalDto): Tone {
  if (isTerminalState(signal.state)) return 'neutral';
  return signal.direction === 'long' ? 'bullish' : 'bearish';
}

export function toneOfDirection(direction: TradeDirection): Tone {
  return direction === 'long' ? 'bullish' : 'bearish';
}

/** Badge variant for a lifecycle state. */
export function stateVariant(
  state: IntradaySignalState,
): 'bullish' | 'bearish' | 'neutral' | 'warning' | 'outline' | 'secondary' {
  switch (state) {
    case 'active':
    case 'confirmed':
      return 'bullish';
    case 'triggered':
      return 'secondary';
    case 'forming':
    case 'watching':
      return 'outline';
    case 'target_met':
      return 'bullish';
    case 'invalidated':
      return 'bearish';
    case 'expired':
      return 'neutral';
  }
}

/**
 * How prominently a quality band renders.
 *
 * `watch` is deliberately quiet: it is above the surfacing floor but below the
 * bar for something worth acting on, and dressing it like a strong setup would
 * defeat the point of having bands at all.
 */
export function qualityVariant(quality: SignalQuality): 'default' | 'secondary' | 'outline' {
  if (quality === 'exceptional') return 'default';
  if (quality === 'strong') return 'secondary';
  return 'outline';
}

/**
 * Ranking within a section.
 *
 * Live before forming before terminal, then by score, then by how recently the
 * state changed. Score alone would let an invalidated 91 outrank an active 78,
 * which is exactly backwards for someone scanning for what to act on.
 */
export function compareSignals(a: IntradaySignalDto, b: IntradaySignalDto): number {
  const rank = (signal: IntradaySignalDto): number => {
    if (isLiveState(signal.state)) return 0;
    if (signal.state === 'forming') return 1;
    if (signal.state === 'watching') return 2;
    return 3;
  };
  return (
    rank(a) - rank(b) ||
    b.score - a.score ||
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export interface SignalSection {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly signals: readonly IntradaySignalDto[];
}

/**
 * Splits the feed into the sections the page renders.
 *
 * A signal appears in exactly one section. Showing the same breakout under
 * both "Strongest BUY" and "Breakout opportunities" would double the apparent
 * number of opportunities, which is the one thing this product must not do.
 */
export function buildSections(signals: readonly IntradaySignalDto[]): SignalSection[] {
  const sorted = [...signals].sort(compareSignals);
  const taken = new Set<number>();

  const take = (predicate: (signal: IntradaySignalDto) => boolean): IntradaySignalDto[] => {
    const picked = sorted.filter((signal) => !taken.has(signal.id) && predicate(signal));
    for (const signal of picked) taken.add(signal.id);
    return picked;
  };

  const isBreakoutKind = (signal: IntradaySignalDto): boolean =>
    signal.kind === 'breakout' || signal.kind === 'breakdown';

  const sections: SignalSection[] = [
    {
      id: 'buy',
      title: 'Strongest BUY setups',
      description: 'Bullish intraday structures that have triggered and remain valid.',
      signals: take(
        (signal) =>
          isLiveState(signal.state) && signal.direction === 'long' && !isBreakoutKind(signal),
      ),
    },
    {
      id: 'sell',
      title: 'Strongest SELL setups',
      description: 'Bearish intraday structures that have triggered and remain valid.',
      signals: take(
        (signal) =>
          isLiveState(signal.state) && signal.direction === 'short' && !isBreakoutKind(signal),
      ),
    },
    {
      id: 'breakouts',
      title: 'Breakout opportunities',
      description: 'Decisive closes through resistance, with participation behind them.',
      signals: take((signal) => isLiveState(signal.state) && signal.kind === 'breakout'),
    },
    {
      id: 'breakdowns',
      title: 'Breakdown opportunities',
      description: 'Decisive closes through support, with participation behind them.',
      signals: take((signal) => isLiveState(signal.state) && signal.kind === 'breakdown'),
    },
    {
      id: 'forming',
      title: 'Setups forming',
      description: 'Structure is in place; the trigger has not fired. Watch, do not act.',
      signals: take((signal) => signal.state === 'forming' || signal.state === 'watching'),
    },
    {
      id: 'closed',
      title: 'Recently invalidated and expired',
      description:
        'Setups that are over. Kept visible so a signal never disappears without an explanation.',
      signals: take((signal) => isTerminalState(signal.state)),
    },
  ];

  return sections.filter((section) => section.signals.length > 0);
}

/** Age of a signal in whole minutes, for the freshness line. */
export function ageMinutes(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

/* ---------------------------------------------------------------------------
 * Filtering
 *
 * Pure, and separate from the controls that drive it, so the same predicate
 * can be tested directly and so an "empty result" can explain itself: "no
 * matches" is alarming, "no matches for these four filters" is actionable.
 * -------------------------------------------------------------------------*/

/** Setup families, as the filter presents them. */
export type SignalFamily = 'breakout' | 'breakdown' | 'vwap' | 'momentum' | 'trend' | 'reversal';

export const FAMILY_LABEL: Record<SignalFamily, string> = {
  breakout: 'Breakout',
  breakdown: 'Breakdown',
  vwap: 'VWAP',
  momentum: 'Momentum',
  trend: 'Trend',
  reversal: 'Reversal',
};

export function familyOf(kind: IntradaySignalDto['kind']): SignalFamily {
  switch (kind) {
    case 'breakout':
      return 'breakout';
    case 'breakdown':
      return 'breakdown';
    case 'vwap_reclaim':
    case 'vwap_breakdown':
      return 'vwap';
    case 'momentum_long':
    case 'momentum_short':
      return 'momentum';
    case 'trend_continuation_long':
    case 'trend_continuation_short':
      return 'trend';
    case 'reversal_long':
    case 'reversal_short':
      return 'reversal';
  }
}

export interface SignalFilterState {
  readonly direction: 'all' | 'long' | 'short';
  /** Empty means every band. */
  readonly qualities: readonly SignalQuality[];
  /** Empty means every family. */
  readonly families: readonly SignalFamily[];
  readonly sector: string | null;
  readonly minScore: number;
  readonly minRiskReward: number;
  /** `live` is the default: a terminal signal is not an opportunity. */
  readonly status: 'live' | 'pending' | 'closed' | 'all';
  readonly query: string;
}

export const DEFAULT_SIGNAL_FILTERS: SignalFilterState = {
  direction: 'all',
  qualities: [],
  families: [],
  sector: null,
  minScore: 0,
  minRiskReward: 0,
  status: 'live',
  query: '',
};

export function applyFilters(
  signals: readonly IntradaySignalDto[],
  filters: SignalFilterState,
): IntradaySignalDto[] {
  const query = filters.query.trim().toLowerCase();

  return signals.filter((signal) => {
    if (filters.direction !== 'all' && signal.direction !== filters.direction) return false;

    if (filters.status === 'live' && !isLiveState(signal.state)) return false;
    if (filters.status === 'pending' && signal.state !== 'forming' && signal.state !== 'watching') {
      return false;
    }
    if (filters.status === 'closed' && !isTerminalState(signal.state)) return false;

    if (filters.qualities.length > 0 && !filters.qualities.includes(signal.quality)) return false;
    if (filters.families.length > 0 && !filters.families.includes(familyOf(signal.kind))) {
      return false;
    }
    if (filters.sector !== null && signal.sector !== filters.sector) return false;
    if (signal.score < filters.minScore) return false;
    if (filters.minRiskReward > 0 && (signal.levels.riskReward ?? 0) < filters.minRiskReward) {
      return false;
    }

    if (query !== '') {
      const haystack = `${signal.symbol} ${signal.name} ${signal.sector ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** The removable chips shown beneath the filter bar. */
export function activeFilterChips(
  filters: SignalFilterState,
): { readonly id: string; readonly label: string }[] {
  const chips: { id: string; label: string }[] = [];

  if (filters.direction !== 'all') {
    chips.push({ id: 'direction', label: filters.direction === 'long' ? 'BUY only' : 'SELL only' });
  }
  if (filters.status !== 'live') {
    const label = { pending: 'Forming only', closed: 'Closed only', all: 'All states' }[
      filters.status
    ];
    chips.push({ id: 'status', label });
  }
  for (const quality of filters.qualities) {
    chips.push({ id: `quality:${quality}`, label: QUALITY_BAND_LABEL[quality] });
  }
  for (const family of filters.families) {
    chips.push({ id: `family:${family}`, label: FAMILY_LABEL[family] });
  }
  if (filters.sector !== null) chips.push({ id: 'sector', label: filters.sector });
  if (filters.minScore > 0) chips.push({ id: 'minScore', label: `Score ≥ ${filters.minScore}` });
  if (filters.minRiskReward > 0) {
    chips.push({ id: 'minRiskReward', label: `R:R ≥ ${filters.minRiskReward}` });
  }
  if (filters.query.trim() !== '') chips.push({ id: 'query', label: `“${filters.query.trim()}”` });

  return chips;
}

const QUALITY_BAND_LABEL: Record<SignalQuality, string> = {
  exceptional: 'Exceptional',
  strong: 'Strong',
  good: 'Good',
  watch: 'Watch',
};

export { QUALITY_BAND_LABEL };

/** Removes one chip, returning the next filter state. */
export function removeFilter(filters: SignalFilterState, id: string): SignalFilterState {
  if (id === 'direction') return { ...filters, direction: 'all' };
  if (id === 'status') return { ...filters, status: 'live' };
  if (id === 'sector') return { ...filters, sector: null };
  if (id === 'minScore') return { ...filters, minScore: 0 };
  if (id === 'minRiskReward') return { ...filters, minRiskReward: 0 };
  if (id === 'query') return { ...filters, query: '' };
  if (id.startsWith('quality:')) {
    const value = id.slice('quality:'.length) as SignalQuality;
    return { ...filters, qualities: filters.qualities.filter((q) => q !== value) };
  }
  if (id.startsWith('family:')) {
    const value = id.slice('family:'.length) as SignalFamily;
    return { ...filters, families: filters.families.filter((f) => f !== value) };
  }
  return filters;
}
