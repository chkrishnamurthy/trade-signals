/**
 * Watchlist wire types.
 *
 * Same contract as the rest of the wire layer: prices are integer PAISE
 * (CLAUDE.md hard rule 3), instants are ISO-8601 strings, and `null` means
 * "not supplied", never zero.
 *
 * Quote fields and indicator fields sit side by side on the row but come from
 * different places on different cadences — the provider's live snapshot, and
 * the worker's end-of-day `daily_indicators` pass. `indicatorDate` says which
 * session the indicator half describes, and it is per-row rather than per-table
 * because a name added this morning may have no indicator row at all while the
 * rest of the list has yesterday's.
 */

export interface WatchlistRowDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly exchange: string;
  readonly sector: string | null;
  /** The user's own reason for watching. Never generated. */
  readonly note: string | null;
  readonly addedAt: string;

  // --- Live quote -----------------------------------------------------------
  /** Last traded price, paise. Null when the provider had no quote at all. */
  readonly ltp: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly dayHigh: number | null;
  readonly dayLow: number | null;
  readonly previousClose: number | null;
  readonly averagePrice: number | null;
  readonly volume: number | null;
  /** Exchange feed time for this row's quote. */
  readonly quoteAt: string | null;

  // --- Daily indicators -----------------------------------------------------
  /** IST trading date of the CLOSED session the indicators describe. */
  readonly indicatorDate: string | null;
  readonly rsi14: number | null;
  readonly ema20: number | null;
  readonly ema50: number | null;
  readonly ema200: number | null;
  readonly sma20: number | null;
  readonly sma50: number | null;
  readonly macdHistogram: number | null;
  readonly atr14: number | null;
  readonly high52w: number | null;
  readonly low52w: number | null;
  readonly averageVolume: number | null;
  readonly relativeVolume: number | null;
}

export interface WatchlistSummaryDto {
  readonly id: number;
  readonly name: string;
  readonly position: number;
  readonly isDefault: boolean;
  readonly count: number;
  readonly updatedAt: string;
}

export interface SortRuleDto {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
}

export interface WatchlistLayoutDto {
  /** Ordered, visible-only column ids. Empty means "use the registry default". */
  readonly columns: readonly string[];
  readonly sort: readonly SortRuleDto[];
  readonly filters: WatchlistFilterStateDto;
  readonly quickView: string | null;
}

/**
 * Persisted filter state.
 *
 * Ranges are `[min, max]` with either end nullable, which is what an open-ended
 * "P/E under 20" needs. Prices are paise here too — a filter that compared
 * rupees against a paise column would be wrong by a factor of a hundred.
 */
export interface RangeDto {
  readonly min: number | null;
  readonly max: number | null;
}

export interface WatchlistFilterStateDto {
  readonly query?: string | undefined;
  readonly sectors?: readonly string[] | undefined;
  readonly exchanges?: readonly string[] | undefined;
  readonly direction?: 'all' | 'advancing' | 'declining' | 'unchanged' | undefined;
  /** Keyed by column id, so a new numeric column is filterable for free. */
  readonly ranges?: Readonly<Record<string, RangeDto>> | undefined;
  /** Column-id predicates that are not ranges — "above EMA 50", "near 52W high". */
  readonly flags?: readonly string[] | undefined;
}

export interface SavedViewDto {
  readonly id: number;
  /** Null = available on every watchlist. */
  readonly watchlistId: number | null;
  readonly name: string;
  readonly columns: readonly string[];
  readonly sort: readonly SortRuleDto[];
  readonly filters: WatchlistFilterStateDto;
}

export interface WatchlistDetailDto {
  readonly watchlist: WatchlistSummaryDto;
  readonly rows: readonly WatchlistRowDto[];
  readonly layout: WatchlistLayoutDto;
  readonly savedViews: readonly SavedViewDto[];
  readonly market: { readonly isOpen: boolean; readonly phase: string };
  readonly fetchedAt: string;
  /** Members the provider returned no quote for. Shown, never dropped. */
  readonly missingQuotes: readonly string[];
  /**
   * True when the quote half could not be fetched at all.
   *
   * The table still renders — indicator columns are worth reading on their
   * own — but the price columns must be labelled stale rather than left to
   * look live.
   */
  readonly quotesStale: boolean;
  readonly refreshAfterSeconds: number;
}
