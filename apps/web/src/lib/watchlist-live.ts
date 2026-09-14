import type { LiveQuoteDto, WatchlistRowDto } from './watchlist-types';

/**
 * Merging live price changes into watchlist rows.
 *
 * A tick carries the last traded price and, sometimes, the session's volume.
 * Everything derived from the price on the row — change, change %, the day's
 * high and low — is recomputed here from the row's own reference values so
 * the columns never disagree with the price beside them. Nothing a tick does
 * not carry is touched: previous close, open, indicators, signals all stay as
 * the last poll left them.
 *
 * Pure, and referentially careful: a row whose price did not change is
 * returned as the SAME object, so the table only re-renders the cells that
 * actually moved.
 */

/** Applies `quotes` to `rows`. Rows are matched by symbol; unknown symbols are ignored. */
export function applyLiveQuotes(
  rows: readonly WatchlistRowDto[],
  quotes: readonly LiveQuoteDto[],
): readonly WatchlistRowDto[] {
  if (quotes.length === 0) return rows;
  const bySymbol = new Map<string, LiveQuoteDto>();
  for (const quote of quotes) bySymbol.set(quote.symbol, quote);

  let changed = false;
  const next = rows.map((row) => {
    const quote = bySymbol.get(row.symbol);
    if (quote === undefined) return row;
    const updated = applyLiveQuote(row, quote);
    if (updated !== row) changed = true;
    return updated;
  });
  return changed ? next : rows;
}

/** Applies one quote to one row, or returns the row untouched if nothing moved. */
export function applyLiveQuote(row: WatchlistRowDto, quote: LiveQuoteDto): WatchlistRowDto {
  // A tick older than what the row already shows is a late arrival, not news.
  if (row.quoteAt !== null && quote.at < row.quoteAt) return row;

  const volume = quote.volume ?? row.volume;
  if (row.ltp === quote.ltp && row.volume === volume) return row;

  const previousClose = row.previousClose;
  const change = previousClose === null ? row.change : quote.ltp - previousClose;
  const changePercent =
    previousClose === null || previousClose === 0
      ? row.changePercent
      : ((quote.ltp - previousClose) / previousClose) * 100;

  return {
    ...row,
    ltp: quote.ltp,
    change,
    changePercent,
    volume,
    dayHigh: row.dayHigh === null ? row.dayHigh : Math.max(row.dayHigh, quote.ltp),
    dayLow: row.dayLow === null ? row.dayLow : Math.min(row.dayLow, quote.ltp),
    quoteAt: quote.at,
  };
}

/**
 * Re-applies the live prices the client already holds over a freshly polled
 * detail, so a poll that raced a tick cannot step the price backwards.
 *
 * Only quotes NEWER than the poll's own timestamp are re-applied; anything
 * older is superseded by the poll, which also carries the fields a tick lacks.
 */
export function overlayNewerQuotes(
  rows: readonly WatchlistRowDto[],
  held: ReadonlyMap<string, LiveQuoteDto>,
  fetchedAt: string,
): readonly WatchlistRowDto[] {
  const newer: LiveQuoteDto[] = [];
  for (const quote of held.values()) {
    if (quote.at > fetchedAt) newer.push(quote);
  }
  return applyLiveQuotes(rows, newer);
}
