import { getColumn } from './watchlist-columns';
import type { SortRuleDto, WatchlistRowDto } from './watchlist-types';

/**
 * Watchlist aggregates and sorting.
 *
 * Pure, and separate from the components that render them, for the same reason
 * the filters are: "how many of these are advancing" is a claim about data and
 * deserves a test, not a hand-check in a browser.
 *
 * The counting rule that matters: a row the exchange gave no change for is
 * UNQUOTED, not unchanged. Folding it into `unchanged` would report a flat name
 * that never traded, and folding it into `declining` would report a loss that
 * never happened. It gets its own count and is excluded from the average.
 */

export interface WatchlistPerformance {
  readonly total: number;
  readonly advancing: number;
  readonly declining: number;
  readonly unchanged: number;
  /** Rows with no usable quote. Never counted as a direction. */
  readonly unquoted: number;
  /**
   * Mean change% across quoted rows only.
   *
   * Unweighted on purpose: this application holds no quantities and no
   * position sizes (CLAUDE.md forbids representing either), so there is no
   * honest weighting available. It is the average move of the names you watch,
   * and it is labelled as exactly that.
   */
  readonly averageChangePercent: number | null;
  readonly best: WatchlistRowDto | null;
  readonly worst: WatchlistRowDto | null;
  /** Combined traded value across quoted rows, in paise. */
  readonly totalTurnover: number | null;
  /** Rows whose price is above all three EMAs, and how many had all three. */
  readonly aboveAllEmas: number;
  readonly withEmas: number;
}

export function summarise(rows: readonly WatchlistRowDto[]): WatchlistPerformance {
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let unquoted = 0;
  let changeSum = 0;
  let quoted = 0;
  let turnover = 0;
  let hasTurnover = false;
  let aboveAllEmas = 0;
  let withEmas = 0;

  let best: WatchlistRowDto | null = null;
  let worst: WatchlistRowDto | null = null;

  for (const row of rows) {
    const change = row.changePercent;

    if (change === null) {
      unquoted += 1;
    } else {
      quoted += 1;
      changeSum += change;
      if (change > 0) advancing += 1;
      else if (change < 0) declining += 1;
      else unchanged += 1;

      if (best === null || change > (best.changePercent ?? Number.NEGATIVE_INFINITY)) best = row;
      if (worst === null || change < (worst.changePercent ?? Number.POSITIVE_INFINITY)) worst = row;
    }

    if (row.ltp !== null && row.volume !== null) {
      turnover += row.ltp * row.volume;
      hasTurnover = true;
    }

    const { ema20, ema50, ema200, ltp } = row;
    if (ltp !== null && ema20 !== null && ema50 !== null && ema200 !== null) {
      withEmas += 1;
      if (ltp > ema20 && ltp > ema50 && ltp > ema200) aboveAllEmas += 1;
    }
  }

  return {
    total: rows.length,
    advancing,
    declining,
    unchanged,
    unquoted,
    averageChangePercent: quoted === 0 ? null : changeSum / quoted,
    best,
    worst,
    totalTurnover: hasTurnover ? turnover : null,
    aboveAllEmas,
    withEmas,
  };
}

/** Distinct sectors present, alphabetical. Drives the sector filter. */
export function sectorsIn(rows: readonly WatchlistRowDto[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.sector !== null && row.sector !== '') seen.add(row.sector);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function exchangesIn(rows: readonly WatchlistRowDto[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) seen.add(row.exchange);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Multi-column sort.
 *
 * Rules apply in order: the first is primary, later ones break its ties. This
 * is what lets "sort by sector, then by change%" group a watchlist the way a
 * sector review actually reads.
 *
 * Missing values sink to the bottom in BOTH directions rather than sorting as
 * zero. A name the exchange did not quote is not the day's worst performer, and
 * a table that puts it there is lying about the ranking.
 */
export function sortRows(
  rows: readonly WatchlistRowDto[],
  sort: readonly SortRuleDto[],
): WatchlistRowDto[] {
  if (sort.length === 0) return [...rows];

  const rules = sort
    .map((rule) => {
      const column = getColumn(rule.columnId);
      return column === null
        ? null
        : { read: column.value, factor: rule.direction === 'asc' ? 1 : -1 };
    })
    .filter(
      (rule): rule is { read: (row: WatchlistRowDto) => number | string | null; factor: number } =>
        rule !== null,
    );

  if (rules.length === 0) return [...rows];

  return [...rows].sort((a, b) => {
    for (const { read, factor } of rules) {
      const left = read(a);
      const right = read(b);

      if (left === null && right === null) continue;
      if (left === null) return 1;
      if (right === null) return -1;

      const comparison =
        typeof left === 'string' || typeof right === 'string'
          ? String(left).localeCompare(String(right))
          : left - right;

      if (comparison !== 0) return comparison * factor;
    }
    return 0;
  });
}

/**
 * Cycles one column through desc → asc → off, keeping other rules.
 *
 * `additive` is the shift-click path: it appends the column as a tie-breaker
 * instead of replacing the sort. Without it, multi-column sorting exists in the
 * model and is unreachable from the UI.
 */
export function toggleSort(
  sort: readonly SortRuleDto[],
  columnId: string,
  additive = false,
): SortRuleDto[] {
  const existing = sort.find((rule) => rule.columnId === columnId);

  if (!additive) {
    if (existing === undefined) return [{ columnId, direction: 'desc' }];
    // Third click clears the sort and restores the list's own order, which for
    // a watchlist is the order the user arranged it in and is itself meaningful.
    return existing.direction === 'desc' ? [{ columnId, direction: 'asc' }] : [];
  }

  if (existing === undefined) return [...sort, { columnId, direction: 'desc' }];
  return sort
    .map((rule) =>
      rule.columnId === columnId
        ? { columnId, direction: rule.direction === 'desc' ? ('asc' as const) : null }
        : rule,
    )
    .filter((rule): rule is SortRuleDto => rule.direction !== null);
}

/** The rule for one column, or null when it is not part of the sort. */
export function sortRuleFor(
  sort: readonly SortRuleDto[],
  columnId: string,
): { rule: SortRuleDto; index: number } | null {
  const index = sort.findIndex((rule) => rule.columnId === columnId);
  const rule = sort[index];
  return index === -1 || rule === undefined ? null : { rule, index };
}
