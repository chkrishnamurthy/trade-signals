import { describe, expect, it } from 'vitest';
import { RETURN_WINDOWS, returnAnchors } from './return-windows';
import {
  DEFAULT_COLUMN_IDS,
  getColumn,
  groupedColumns,
  isColumnAvailable,
  PINNED_COLUMN_ID,
  reorderColumnIds,
  resolveColumns,
  toStoredColumnIds,
  WATCHLIST_COLUMNS,
} from './watchlist-columns';
import {
  activeFilterChips,
  applyWatchlistFilters,
  isFlagAvailable,
  removeWatchlistFilter,
  setRange,
  toggleFacet,
  WATCHLIST_FLAGS,
} from './watchlist-filters';
import { exchangesIn, sectorsIn, sortRows, summarise, toggleSort } from './watchlist-summary';
import type { WatchlistRowDto } from './watchlist-types';
import { isQuickViewAvailable, missingSourcesFor, QUICK_VIEWS } from './watchlist-views';

/**
 * The watchlist model.
 *
 * Prices in these fixtures are PAISE, as everywhere else: 250000 is ₹2,500.
 */
function row(overrides: Partial<WatchlistRowDto> = {}): WatchlistRowDto {
  return {
    instrumentId: 1,
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    exchange: 'NSE',
    sector: 'Energy',
    note: null,
    addedAt: '2026-08-01T04:00:00.000Z',
    ltp: 250000,
    change: 2500,
    changePercent: 1.01,
    open: 248000,
    dayHigh: 251000,
    dayLow: 247500,
    previousClose: 247500,
    averagePrice: 249000,
    volume: 4_000_000,
    quoteAt: '2026-08-24T09:45:00.000Z',
    indicatorDate: '2026-08-23',
    rsi14: 58.2,
    ema20: 245000,
    ema50: 240000,
    ema200: 230000,
    sma20: 244000,
    sma50: 239000,
    macdHistogram: 320,
    atr14: 4200,
    high52w: 280000,
    low52w: 200000,
    averageVolume: 3_000_000,
    relativeVolume: 1.33,
    previousVolume: 3_200_000,
    returnCloses: {
      return1w: 245000,
      return1m: 240000,
      return3m: 220000,
      return6m: 200000,
      returnYtd: 210000,
      return1y: 190000,
    },
    signal: {
      direction: 'bullish',
      strength: 68,
      setups: ['Golden cross'],
      tradingDate: '2026-08-23',
    },
    setup: {
      kind: 'breakout',
      direction: 'long',
      state: 'active',
      score: 74,
      quality: 'strong',
      entryLow: 250000,
      entryHigh: 250500,
      invalidationLevel: 247000,
      target1: 256000,
      netRiskReward: 1.8,
    },
    ...overrides,
  };
}

describe('column registry', () => {
  it('gives every column a unique id', () => {
    const ids = WATCHLIST_COLUMNS.map((column) => column.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pins exactly one column', () => {
    const pinned = WATCHLIST_COLUMNS.filter((column) => column.pinned === true);
    expect(pinned.map((column) => column.id)).toEqual([PINNED_COLUMN_ID]);
  });

  it('defaults to columns that all exist and are all available', () => {
    for (const id of DEFAULT_COLUMN_IDS) {
      const column = getColumn(id);
      expect(column, `default column ${id} is not in the registry`).not.toBeNull();
      expect(isColumnAvailable(column!), `default column ${id} has no data source`).toBe(true);
    }
  });

  it('declares the fundamentals columns as having no source, and returns null for them', () => {
    for (const id of [
      'marketCap',
      'peRatio',
      'forwardPeRatio',
      'pbRatio',
      'pegRatio',
      'evEbitda',
      'eps',
      'revenue',
      'roe',
      'promoterPledge',
      'dividendYield',
    ]) {
      const column = getColumn(id);
      expect(column).not.toBeNull();
      expect(column!.source).toBeNull();
      // The load-bearing half: an unavailable column must never invent a number.
      expect(column!.value(row())).toBeNull();
    }
  });

  it('gives every unavailable column a reason, and no available one a reason', () => {
    for (const column of WATCHLIST_COLUMNS) {
      if (column.source === null) {
        expect(column.unavailableReason, `${column.id} is unavailable with no reason`).toBeTruthy();
      } else {
        expect(column.unavailableReason, `${column.id} has a source and a reason`).toBeUndefined();
      }
    }
  });

  it('never invents a value for a column with no source', () => {
    const populated = row();
    for (const column of WATCHLIST_COLUMNS) {
      if (column.source !== null) continue;
      expect(column.value(populated), `${column.id} produced a value`).toBeNull();
    }
  });

  it('groups every column under a group the panel actually lists', () => {
    const listed = new Set(groupedColumns().flatMap((group) => group.columns.map((c) => c.id)));
    for (const column of WATCHLIST_COLUMNS) {
      if (column.pinned === true) continue;
      expect(listed.has(column.id), `${column.id} is in no listed group`).toBe(true);
    }
  });

  it('offers each of the eight advertised groups', () => {
    const labels = groupedColumns().map((group) => group.label);
    expect(labels).toEqual([
      'Price',
      'Performance',
      'Volume & Liquidity',
      'Valuation',
      'Fundamentals',
      '52-Week Position',
      'Technical Indicators',
      'Trading Signals',
      'Market Information',
    ]);
  });

  it('forces the pinned column to the front even when a stored layout omits it', () => {
    const resolved = resolveColumns(['changePercent', 'ltp']);
    expect(resolved.map((column) => column.id)).toEqual(['symbol', 'changePercent', 'ltp']);
  });

  it('drops unknown ids rather than failing, so a removed column cannot strand a layout', () => {
    const resolved = resolveColumns(['ltp', 'column_that_was_deleted', 'rsi14']);
    expect(resolved.map((column) => column.id)).toEqual(['symbol', 'ltp', 'rsi14']);
  });

  it('de-duplicates a stored layout that names a column twice', () => {
    expect(resolveColumns(['ltp', 'ltp']).map((c) => c.id)).toEqual(['symbol', 'ltp']);
  });

  it('round-trips through the stored form without the implicit pinned column', () => {
    const stored = toStoredColumnIds(resolveColumns(['ltp', 'rsi14']));
    expect(stored).toEqual(['ltp', 'rsi14']);
    expect(resolveColumns(stored).map((c) => c.id)).toEqual(['symbol', 'ltp', 'rsi14']);
  });

  it('searches columns by label, description and group name', () => {
    const flatten = (query: string): string[] =>
      groupedColumns(query).flatMap((group) => group.columns.map((column) => column.id));

    expect(flatten('dividend')).toContain('dividendYield');
    expect(flatten('exponential moving average')).toEqual(
      expect.arrayContaining(['ema20', 'ema50', 'ema200']),
    );
    // Group name matches too.
    expect(flatten('valuation')).toEqual(expect.arrayContaining(['peRatio', 'pbRatio']));
    expect(flatten('no such column')).toEqual([]);
  });

  it('never offers the pinned column in the customize panel', () => {
    const offered = groupedColumns().flatMap((group) => group.columns.map((column) => column.id));
    expect(offered).not.toContain(PINNED_COLUMN_ID);
  });

  it('reorders a column to a new index', () => {
    expect(reorderColumnIds(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(reorderColumnIds(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    // Out of range clamps rather than producing a hole.
    expect(reorderColumnIds(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
    // Unknown id is a no-op.
    expect(reorderColumnIds(['a', 'b'], 'z', 0)).toEqual(['a', 'b']);
  });
});

describe('derived column values', () => {
  it('computes distance from the 52-week high as a negative percentage', () => {
    const value = getColumn('from52wHigh')!.value(row({ ltp: 252000, high52w: 280000 }));
    expect(value).toBeCloseTo(-10, 5);
  });

  it('computes ATR as a percentage of price', () => {
    const value = getColumn('atrPercent')!.value(row({ atr14: 5000, ltp: 250000 }));
    expect(value).toBeCloseTo(2, 5);
  });

  it('computes turnover as price times volume, in paise', () => {
    expect(getColumn('turnover')!.value(row({ ltp: 250000, volume: 1000 }))).toBe(250_000_000);
  });

  it('places the day range position between the low and the high', () => {
    const value = getColumn('dayRange')!.value(
      row({ dayLow: 100000, dayHigh: 200000, ltp: 175000 }),
    );
    expect(value).toBe(75);
  });

  it('returns null for a day range with no width rather than dividing by zero', () => {
    const value = getColumn('dayRange')!.value(
      row({ dayLow: 100000, dayHigh: 100000, ltp: 100000 }),
    );
    expect(value).toBeNull();
  });

  it('places the 52-week position between the two extremes', () => {
    const value = getColumn('range52w')!.value(
      row({ low52w: 200000, high52w: 300000, ltp: 275000 }),
    );
    expect(value).toBe(75);
  });

  it('computes each trailing return against its own anchor close', () => {
    const fixture = row({ ltp: 250000 });
    // 250000 against the 1M anchor of 240000 is +4.166…%.
    expect(getColumn('return1m')!.value(fixture)).toBeCloseTo(4.1667, 3);
    expect(getColumn('return1y')!.value(fixture)).toBeCloseTo(31.579, 3);
  });

  it('reports a return with no anchor session as absent, not as zero', () => {
    // 3Y and 5Y are missing from the fixture — history does not reach.
    expect(getColumn('return3y')!.value(row())).toBeNull();
    expect(getColumn('return5y')!.value(row())).toBeNull();
    // And an unquoted row cannot have a return at all.
    expect(getColumn('return1m')!.value(row({ ltp: null }))).toBeNull();
  });

  it('registers one column per declared return window', () => {
    for (const window of RETURN_WINDOWS) {
      expect(getColumn(window.id), `no column for ${window.id}`).not.toBeNull();
    }
  });

  it('compares session volume against the previous session, not the average', () => {
    const value = getColumn('volumeChangePercent')!.value(
      row({ volume: 4_000_000, previousVolume: 3_200_000 }),
    );
    expect(value).toBeCloseTo(25, 5);
    expect(
      getColumn('volumeChangePercent')!.value(row({ volume: 4_000_000, previousVolume: null })),
    ).toBeNull();
  });

  it('flags a name inside the 5% band at either 52-week extreme', () => {
    const nearHigh = getColumn('near52wHigh')!;
    expect(nearHigh.value(row({ ltp: 275000, high52w: 280000 }))).toBe(1);
    expect(nearHigh.value(row({ ltp: 200000, high52w: 280000 }))).toBe(0);
    // No 52-week high is not "not near it".
    expect(nearHigh.value(row({ high52w: null }))).toBeNull();

    const nearLow = getColumn('near52wLow')!;
    expect(nearLow.value(row({ ltp: 204000, low52w: 200000 }))).toBe(1);
    expect(nearLow.value(row({ ltp: 260000, low52w: 200000 }))).toBe(0);
  });

  it('ranks the signal column by direction rather than alphabetically', () => {
    const signal = getColumn('signal')!;
    const at = (direction: string): number | string | null =>
      signal.value(
        row({
          signal: {
            direction: direction as never,
            strength: 50,
            setups: [],
            tradingDate: '2026-08-23',
          },
        }),
      );
    expect(at('strong_bullish')).toBeGreaterThan(at('bullish') as number);
    expect(at('bearish')).toBeLessThan(at('neutral') as number);
    expect(signal.value(row({ signal: null }))).toBeNull();
  });

  it('marks the live intraday setup columns as unavailable, never inventing a level', () => {
    // The engine that wrote these was removed, so the columns are declared
    // source-less: even with a fully-populated `setup` on the row, they must
    // render nothing rather than a stale level.
    const populated = row();
    for (const id of [
      'setupState',
      'setupScore',
      'entryZone',
      'setupTarget',
      'setupInvalidation',
      'setupRiskReward',
    ]) {
      const column = getColumn(id)!;
      expect(column.source, id).toBeNull();
      expect(column.value(populated), id).toBeNull();
    }
  });

  it('counts EMAs the price is above', () => {
    const trend = getColumn('trend')!;
    expect(trend.value(row({ ltp: 250000 }))).toBe(3);
    expect(trend.value(row({ ltp: 243000 }))).toBe(2);
    expect(trend.value(row({ ltp: 100000 }))).toBe(0);
  });

  it('separates "below every EMA" from "we have no EMAs"', () => {
    const trend = getColumn('trend')!;
    // Below all three is a real, bearish 0.
    expect(trend.value(row({ ltp: 1000 }))).toBe(0);
    // No moving averages at all is absent, not bearish.
    expect(trend.value(row({ ema20: null, ema50: null, ema200: null }))).toBeNull();
  });
});

describe('filters', () => {
  const rows = [
    row({ symbol: 'RELIANCE', sector: 'Energy', changePercent: 1.5, rsi14: 58, ltp: 250000 }),
    row({ symbol: 'TCS', sector: 'IT', changePercent: -0.8, rsi14: 28, ltp: 380000 }),
    row({ symbol: 'HDFCBANK', sector: 'Banking', changePercent: 0, rsi14: 72, ltp: 160000 }),
    row({ symbol: 'NODATA', sector: 'IT', changePercent: null, ltp: null, rsi14: null }),
  ];

  it('returns everything when no facet is set', () => {
    expect(applyWatchlistFilters(rows, {})).toHaveLength(4);
  });

  it('matches the free-text query against symbol, name, sector and note', () => {
    expect(applyWatchlistFilters(rows, { query: 'tcs' }).map((r) => r.symbol)).toEqual(['TCS']);
    expect(applyWatchlistFilters(rows, { query: 'banking' }).map((r) => r.symbol)).toEqual([
      'HDFCBANK',
    ]);
    const noted = [row({ symbol: 'X', note: 'breakout candidate' })];
    expect(applyWatchlistFilters(noted, { query: 'breakout' })).toHaveLength(1);
  });

  it('treats an unquoted row as neither advancing nor declining', () => {
    expect(applyWatchlistFilters(rows, { direction: 'advancing' }).map((r) => r.symbol)).toEqual([
      'RELIANCE',
    ]);
    expect(applyWatchlistFilters(rows, { direction: 'declining' }).map((r) => r.symbol)).toEqual([
      'TCS',
    ]);
    expect(applyWatchlistFilters(rows, { direction: 'unchanged' }).map((r) => r.symbol)).toEqual([
      'HDFCBANK',
    ]);
  });

  it('filters by a range on any registry column, in the column’s own units', () => {
    const filtered = applyWatchlistFilters(rows, { ranges: { rsi14: { min: 30, max: 70 } } });
    expect(filtered.map((r) => r.symbol)).toEqual(['RELIANCE']);
  });

  it('excludes rows with no value from a range rather than counting them as zero', () => {
    const filtered = applyWatchlistFilters(rows, { ranges: { ltp: { min: null, max: 200000 } } });
    // HDFCBANK at ₹1,600 qualifies; NODATA has no price and must not.
    expect(filtered.map((r) => r.symbol)).toEqual(['HDFCBANK']);
  });

  it('applies an open-ended range', () => {
    const filtered = applyWatchlistFilters(rows, { ranges: { ltp: { min: 300000, max: null } } });
    expect(filtered.map((r) => r.symbol)).toEqual(['TCS']);
  });

  it('combines flags conjunctively', () => {
    const filtered = applyWatchlistFilters(rows, { flags: ['rsi_oversold'] });
    expect(filtered.map((r) => r.symbol)).toEqual(['TCS']);
    expect(applyWatchlistFilters(rows, { flags: ['rsi_oversold', 'rsi_overbought'] })).toEqual([]);
  });

  it('ignores a range naming a column that no longer exists', () => {
    expect(applyWatchlistFilters(rows, { ranges: { gone: { min: 1, max: 2 } } })).toHaveLength(4);
  });

  it('ignores an unknown flag id rather than filtering everything out', () => {
    expect(applyWatchlistFilters(rows, { flags: ['no_such_flag'] })).toHaveLength(4);
  });

  it('reports every flag as available, since all read columns we have', () => {
    for (const flag of WATCHLIST_FLAGS) {
      expect(isFlagAvailable(flag), `${flag.id} reads a column with no source`).toBe(true);
    }
  });
});

describe('filter chips', () => {
  it('describes each active facet once', () => {
    const chips = activeFilterChips({
      query: 'rel',
      sectors: ['Energy'],
      direction: 'advancing',
      ranges: { rsi14: { min: 30, max: 70 } },
      flags: ['volume_surge'],
    });
    expect(chips.map((chip) => chip.id)).toEqual([
      'query',
      'sector:Energy',
      'direction:advancing',
      'range:rsi14',
      'flag:volume_surge',
    ]);
  });

  it('formats a paise bound as rupees', () => {
    const [chip] = activeFilterChips({ ranges: { ltp: { min: 250000, max: null } } });
    expect(chip?.label).toBe('LTP ≥ ₹2,500');
  });

  it('omits a range with neither bound set', () => {
    expect(activeFilterChips({ ranges: { ltp: { min: null, max: null } } })).toEqual([]);
  });

  it('removes exactly the facet a chip names', () => {
    const filters = {
      sectors: ['Energy', 'IT'],
      ranges: { rsi14: { min: 30, max: null }, ltp: { min: 1, max: null } },
      flags: ['volume_surge', 'rsi_oversold'],
    };
    expect(removeWatchlistFilter(filters, 'sector:Energy').sectors).toEqual(['IT']);
    expect(Object.keys(removeWatchlistFilter(filters, 'range:rsi14').ranges ?? {})).toEqual([
      'ltp',
    ]);
    expect(removeWatchlistFilter(filters, 'flag:volume_surge').flags).toEqual(['rsi_oversold']);
  });

  it('drops a range from state when both bounds are cleared', () => {
    const filters = setRange({ ranges: { rsi14: { min: 30, max: 70 } } }, 'rsi14', {
      min: null,
      max: null,
    });
    expect(filters.ranges).toEqual({});
  });

  it('toggles a facet value in and out', () => {
    expect(toggleFacet(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleFacet(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('summary', () => {
  it('counts directions and excludes unquoted rows from the average', () => {
    const summary = summarise([
      row({ symbol: 'A', changePercent: 2 }),
      row({ symbol: 'B', changePercent: -1 }),
      row({ symbol: 'C', changePercent: 0 }),
      row({ symbol: 'D', changePercent: null }),
    ]);

    expect(summary.total).toBe(4);
    expect(summary.advancing).toBe(1);
    expect(summary.declining).toBe(1);
    expect(summary.unchanged).toBe(1);
    expect(summary.unquoted).toBe(1);
    // (2 + -1 + 0) / 3 — the unquoted row is not a zero.
    expect(summary.averageChangePercent).toBeCloseTo(1 / 3, 10);
  });

  it('picks the best and worst performers', () => {
    const summary = summarise([
      row({ symbol: 'A', changePercent: 2 }),
      row({ symbol: 'B', changePercent: -3 }),
      row({ symbol: 'C', changePercent: 5 }),
    ]);
    expect(summary.best?.symbol).toBe('C');
    expect(summary.worst?.symbol).toBe('B');
  });

  it('reports no average and no extremes for an empty or wholly unquoted list', () => {
    expect(summarise([]).averageChangePercent).toBeNull();
    const dark = summarise([row({ changePercent: null })]);
    expect(dark.averageChangePercent).toBeNull();
    expect(dark.best).toBeNull();
    expect(dark.worst).toBeNull();
  });

  it('sums turnover only over rows that have both price and volume', () => {
    const summary = summarise([
      row({ ltp: 100, volume: 10 }),
      row({ ltp: null, volume: 10 }),
      row({ ltp: 100, volume: null }),
    ]);
    expect(summary.totalTurnover).toBe(1000);
    expect(summarise([row({ ltp: null, volume: null })]).totalTurnover).toBeNull();
  });

  it('counts trend participation only over rows that have all three EMAs', () => {
    const summary = summarise([
      row({ ltp: 250000 }),
      row({ ltp: 100000 }),
      row({ ema200: null, ltp: 250000 }),
    ]);
    expect(summary.withEmas).toBe(2);
    expect(summary.aboveAllEmas).toBe(1);
  });

  it('lists the distinct sectors and exchanges present', () => {
    const rows = [
      row({ sector: 'IT', exchange: 'NSE' }),
      row({ sector: 'Energy', exchange: 'BSE' }),
      row({ sector: 'IT', exchange: 'NSE' }),
      row({ sector: null, exchange: 'NSE' }),
    ];
    expect(sectorsIn(rows)).toEqual(['Energy', 'IT']);
    expect(exchangesIn(rows)).toEqual(['BSE', 'NSE']);
  });
});

describe('sorting', () => {
  const rows = [
    row({ symbol: 'A', changePercent: 1, sector: 'IT' }),
    row({ symbol: 'B', changePercent: 3, sector: 'Energy' }),
    row({ symbol: 'C', changePercent: null, sector: 'Energy' }),
    row({ symbol: 'D', changePercent: 2, sector: 'Energy' }),
  ];

  it('sorts descending and ascending by a numeric column', () => {
    expect(
      sortRows(rows, [{ columnId: 'changePercent', direction: 'desc' }]).map((r) => r.symbol),
    ).toEqual(['B', 'D', 'A', 'C']);
    expect(
      sortRows(rows, [{ columnId: 'changePercent', direction: 'asc' }]).map((r) => r.symbol),
    ).toEqual(['A', 'D', 'B', 'C']);
  });

  it('sinks missing values to the bottom in BOTH directions', () => {
    for (const direction of ['asc', 'desc'] as const) {
      const sorted = sortRows(rows, [{ columnId: 'changePercent', direction }]);
      expect(sorted.at(-1)?.symbol).toBe('C');
    }
  });

  it('breaks ties with the second rule', () => {
    const sorted = sortRows(rows, [
      { columnId: 'sector', direction: 'asc' },
      { columnId: 'changePercent', direction: 'desc' },
    ]);
    expect(sorted.map((r) => r.symbol)).toEqual(['B', 'D', 'C', 'A']);
  });

  it('leaves the list in its own order when nothing is sorted', () => {
    expect(sortRows(rows, []).map((r) => r.symbol)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('ignores a rule naming a column that no longer exists', () => {
    expect(sortRows(rows, [{ columnId: 'gone', direction: 'desc' }]).map((r) => r.symbol)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('cycles a column through desc, asc and off', () => {
    let sort = toggleSort([], 'ltp');
    expect(sort).toEqual([{ columnId: 'ltp', direction: 'desc' }]);
    sort = toggleSort(sort, 'ltp');
    expect(sort).toEqual([{ columnId: 'ltp', direction: 'asc' }]);
    sort = toggleSort(sort, 'ltp');
    expect(sort).toEqual([]);
  });

  it('replaces the sort on a plain click and appends on an additive one', () => {
    const initial = toggleSort([], 'ltp');
    expect(toggleSort(initial, 'rsi14')).toEqual([{ columnId: 'rsi14', direction: 'desc' }]);
    expect(toggleSort(initial, 'rsi14', true)).toEqual([
      { columnId: 'ltp', direction: 'desc' },
      { columnId: 'rsi14', direction: 'desc' },
    ]);
  });

  it('drops one rule from a multi-column sort without disturbing the rest', () => {
    const sort = toggleSort(toggleSort([], 'ltp'), 'rsi14', true);
    const cycled = toggleSort(toggleSort(sort, 'ltp', true), 'ltp', true);
    expect(cycled).toEqual([{ columnId: 'rsi14', direction: 'desc' }]);
  });
});

describe('quick views', () => {
  it('gives every view a unique id and only known columns', () => {
    const ids = QUICK_VIEWS.map((view) => view.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const view of QUICK_VIEWS) {
      for (const id of view.columns) {
        expect(getColumn(id), `view ${view.id} names unknown column ${id}`).not.toBeNull();
      }
      for (const rule of view.sort) {
        expect(
          getColumn(rule.columnId),
          `view ${view.id} sorts by unknown ${rule.columnId}`,
        ).not.toBeNull();
      }
    }
  });

  it('sorts only by a column the view actually shows', () => {
    for (const view of QUICK_VIEWS) {
      for (const rule of view.sort) {
        expect(
          view.columns.includes(rule.columnId),
          `view ${view.id} sorts by hidden column ${rule.columnId}`,
        ).toBe(true);
      }
    }
  });

  it('marks the views whose columns have no source as unavailable, with a reason', () => {
    // Fundamentals (no feed) and the live intraday setups (engine removed).
    for (const id of ['high_dividend', 'valuation', 'live_setups']) {
      const view = QUICK_VIEWS.find((entry) => entry.id === id)!;
      expect(isQuickViewAvailable(view)).toBe(false);
      expect(missingSourcesFor(view).length).toBeGreaterThan(0);
    }
  });

  it('marks every price, volume and technical view as available', () => {
    for (const id of [
      'overview',
      'top_gainers',
      'top_losers',
      'most_active',
      'near_52w_high',
      'near_52w_low',
      'strong_momentum',
      'oversold',
      'volatility',
      'performance',
      'daily_signals',
    ]) {
      const view = QUICK_VIEWS.find((entry) => entry.id === id)!;
      expect(isQuickViewAvailable(view), `${id}: ${missingSourcesFor(view).join(', ')}`).toBe(true);
    }
  });

  it('applies a view’s filters as an ordinary filter state', () => {
    const gainers = QUICK_VIEWS.find((view) => view.id === 'top_gainers')!;
    const rows = [
      row({ symbol: 'UP', changePercent: 2 }),
      row({ symbol: 'DOWN', changePercent: -2 }),
    ];
    expect(applyWatchlistFilters(rows, gainers.filters).map((r) => r.symbol)).toEqual(['UP']);
  });
});

describe('return windows', () => {
  const NOON_IST = new Date('2026-08-24T06:30:00.000Z');

  it('anchors each window on the right calendar date, in IST', () => {
    const anchors = new Map(returnAnchors(NOON_IST).map((a) => [a.key, a.at.toISOString()]));
    expect(anchors.get('return1w')).toBe('2026-08-17T23:59:59.999Z');
    expect(anchors.get('return1m')).toBe('2026-07-24T23:59:59.999Z');
    expect(anchors.get('return6m')).toBe('2026-02-24T23:59:59.999Z');
    expect(anchors.get('return1y')).toBe('2025-08-24T23:59:59.999Z');
    expect(anchors.get('return5y')).toBe('2021-08-24T23:59:59.999Z');
  });

  it('anchors YTD on the last day of the previous calendar year', () => {
    const anchors = new Map(returnAnchors(NOON_IST).map((a) => [a.key, a.at.toISOString()]));
    expect(anchors.get('returnYtd')).toBe('2025-12-31T23:59:59.999Z');
  });

  it('clamps a month-end shift instead of rolling into the next month', () => {
    // 31 March minus one month is February, not 3 March.
    const anchors = new Map(
      returnAnchors(new Date('2026-03-31T06:30:00.000Z')).map((a) => [a.key, a.at.toISOString()]),
    );
    expect(anchors.get('return1m')).toBe('2026-02-28T23:59:59.999Z');
  });

  it('uses the IST date, not the UTC one, after 18:30 UTC', () => {
    // 19:00 UTC on the 24th is already the 25th in IST.
    const anchors = new Map(
      returnAnchors(new Date('2026-08-24T19:00:00.000Z')).map((a) => [a.key, a.at.toISOString()]),
    );
    expect(anchors.get('return1w')).toBe('2026-08-18T23:59:59.999Z');
  });

  it('keeps a tolerance tight enough that a stale bar cannot answer a week', () => {
    const week = RETURN_WINDOWS.find((window) => window.id === 'return1w');
    expect(week?.toleranceDays).toBeLessThan(14);
  });
});

describe('registry and renderers agree', () => {
  it('has a cell renderer for every registered column', async () => {
    // Imported lazily: the renderer module is a client component and pulls in
    // React, which the rest of this suite deliberately does not need.
    const { hasCell } = await import('@/components/watchlists/watchlist-cells');
    for (const column of WATCHLIST_COLUMNS) {
      expect(hasCell(column.id), `no cell renderer for column "${column.id}"`).toBe(true);
    }
  });
});
