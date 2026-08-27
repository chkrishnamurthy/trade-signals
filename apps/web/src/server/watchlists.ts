import 'server-only';
import {
  addWatchlistItems,
  closesAsOf,
  createWatchlist,
  deleteWatchlist,
  deleteWatchlistView,
  ensureInstruments,
  getWatchlistLayout,
  getWatchlistMembers,
  type InstrumentSetup,
  type InstrumentSignal,
  latestIndicatorsForInstruments,
  latestSignalsForInstruments,
  listWatchlists,
  listWatchlistViews,
  liveSetupsForInstruments,
  removeWatchlistItems,
  renameWatchlist,
  reorderWatchlistItems,
  reorderWatchlists,
  saveWatchlistLayout,
  saveWatchlistView,
  setDefaultWatchlist,
} from '@equitywise/db';
import type { InstrumentRef, Quote, QuotesResult } from '@equitywise/market-data';
import { istDateKey } from '@equitywise/shared';
import type { SignalDirection } from '@/lib/dashboard-types';
import { type ReturnCloses, returnAnchors } from '@/lib/return-windows';
import type {
  RowSetupDto,
  RowSignalDto,
  SavedViewDto,
  WatchlistDetailDto,
  WatchlistFilterStateDto,
  WatchlistLayoutDto,
  WatchlistRowDto,
  WatchlistSummaryDto,
} from '@/lib/watchlist-types';
import { getDatabase } from './db';
import { toMarketError } from './errors';
import { getIndex, listIndexKeys } from './indices';
import { getMarketStatus } from './market-status';
import { getProvider } from './provider';
import { resolveSymbol, warmInstrumentCache } from './search';

/**
 * Watchlist reads and writes for the web app.
 *
 * Composes sources that are deliberately NOT fetched together:
 *
 *   quotes      the provider, live, one batched call for the whole list
 *   indicators  `daily_indicators`, written by the worker's end-of-day pass
 *   signals     the daily engine's stored verdict, read never recomputed
 *   setups      today's live intraday signals, for the level columns
 *   returns     anchor closes from `daily_candles`, for the trailing windows
 *
 * The indicator half costs one indexed query rather than one history call per
 * symbol, which is the only reason a watchlist can show RSI and 52-week extremes
 * for arbitrary names without spending the provider's entire minute budget. It
 * also means the web app READS derived data instead of recomputing it, which is
 * the same split the intraday signals already use.
 *
 * A row can have a quote and no indicators (a name the worker does not ingest,
 * or one added today), or indicators and no quote (the provider is down, the
 * market never opened for it). Both are rendered; neither is faked.
 */

/** How long a watchlist client should wait before polling again. */
const REFRESH_OPEN_SECONDS = 15;
const REFRESH_CLOSED_SECONDS = 300;

export async function getWatchlists(): Promise<WatchlistSummaryDto[]> {
  const rows = await listWatchlists(getDatabase());
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    isDefault: row.isDefault,
    count: row.count,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Sector lookup, from the configured index constituents.
 *
 * `instruments` has no sector column — the classification lives in
 * `config/indices.yaml` alongside the universe it describes. A watchlist name
 * outside every configured index has no sector, and gets `null` rather than
 * "Other", because "we do not classify this" and "miscellaneous" are different
 * claims.
 */
async function sectorMap(): Promise<Map<string, string>> {
  const sectors = new Map<string, string>();
  for (const key of await listIndexKeys()) {
    const index = await getIndex(key);
    if (index === null) continue;
    for (const constituent of index.constituents) {
      if (!sectors.has(constituent.symbol)) sectors.set(constituent.symbol, constituent.sector);
    }
  }
  return sectors;
}

function defaultLayout(): WatchlistLayoutDto {
  return { columns: [], sort: [], filters: {}, quickView: null };
}

/**
 * One watchlist, with every row's quote and indicator data.
 *
 * A quote failure degrades rather than throws: the indicator columns are worth
 * reading on their own, and a watchlist that renders nothing because the
 * provider is rate-limited is strictly less useful than one that renders what
 * it has and says the prices are stale.
 */
export async function getWatchlistDetail(id: number): Promise<WatchlistDetailDto | null> {
  const db = getDatabase();

  const summaries = await getWatchlists();
  const watchlist = summaries.find((entry) => entry.id === id);
  if (watchlist === undefined) return null;

  const [members, storedLayout, storedViews, market, sectors] = await Promise.all([
    getWatchlistMembers(db, id),
    getWatchlistLayout(db, id),
    listWatchlistViews(db, id),
    getMarketStatus(),
    sectorMap(),
  ]);

  const instrumentIds = members.map((member) => member.instrumentId);
  const now = new Date();

  // Not awaited: this only shortens the wait for whichever request needs the
  // instrument universe next — expanding a row's chart, most likely, for any
  // member outside `config/indices.yaml`. Awaiting it here would trade a slow
  // chart load for a slow watchlist load; the point is to move the cost off
  // the interactive path entirely, not just relocate it.
  warmInstrumentCache();

  // The live quote call is the one network hop in this function — everything
  // else here is a DB read — so it runs ALONGSIDE the indicator batch below
  // rather than after it. It used to be a separate, later `await`, which made
  // this function's total time the SUM of the DB batch and the provider call
  // instead of the max of the two; a slow or retrying provider call added its
  // full duration on top of an otherwise-fast DB read for no reason, since
  // neither side reads the other's result.
  const quotesPromise: Promise<{
    quotes: ReadonlyMap<string, Quote>;
    missingQuotes: readonly string[];
    quotesStale: boolean;
  }> =
    members.length === 0
      ? Promise.resolve({ quotes: new Map(), missingQuotes: [], quotesStale: false })
      : fetchQuotesFor(members)
          .then((result) => ({
            quotes: result.quotes,
            missingQuotes: result.missing,
            quotesStale: false,
          }))
          .catch(() => ({
            // Prices unavailable. The table still renders; the UI labels it.
            quotes: new Map<string, Quote>(),
            missingQuotes: members.map((member) => member.symbol),
            quotesStale: true,
          }));

  // The indicator read still decides whether this call succeeds, as it always
  // has. The three added sources only enrich a column group each — no signals
  // written yet, a candle table not backfilled that far — so each degrades to
  // an empty map rather than taking a working watchlist down with it.
  const [indicators, signals, setups, returnCloses, quoteResult] = await Promise.all([
    latestIndicatorsForInstruments(db, instrumentIds),
    latestSignalsForInstruments(db, instrumentIds).catch(() => new Map<number, InstrumentSignal>()),
    liveSetupsFor(db, instrumentIds, now),
    closesAsOf(db, { instrumentIds, anchors: returnAnchors(now) }).catch(
      () => new Map<number, Map<string, number>>(),
    ),
    quotesPromise,
  ]);

  const { quotes, missingQuotes, quotesStale } = quoteResult;

  const rows: WatchlistRowDto[] = members.map((member) => {
    const quote = quotes.get(member.symbol) ?? null;
    const daily = indicators.get(member.instrumentId) ?? null;

    return {
      instrumentId: member.instrumentId,
      symbol: member.symbol,
      name: member.name,
      exchange: member.exchange,
      sector: sectors.get(member.symbol) ?? null,
      note: member.note,
      addedAt: member.addedAt.toISOString(),

      ltp: quote?.ltp ?? null,
      change: quote?.change ?? null,
      changePercent: quote?.changePercent ?? null,
      open: quote?.open ?? null,
      dayHigh: quote?.high ?? null,
      dayLow: quote?.low ?? null,
      previousClose: quote?.previousClose ?? null,
      averagePrice: quote?.averagePrice ?? null,
      volume: quote?.volume ?? null,
      quoteAt: quote?.timestamp?.toISOString() ?? null,

      indicatorDate: daily?.tradingDate ?? null,
      rsi14: daily?.rsi14 ?? null,
      ema20: daily?.ema20 ?? null,
      ema50: daily?.ema50 ?? null,
      ema200: daily?.ema200 ?? null,
      sma20: daily?.sma20 ?? null,
      sma50: daily?.sma50 ?? null,
      macdHistogram: daily?.macdHistogram ?? null,
      atr14: daily?.atr14 ?? null,
      high52w: daily?.high52w ?? null,
      low52w: daily?.low52w ?? null,
      averageVolume: daily?.averageVolume ?? null,
      relativeVolume: daily?.relativeVolume ?? null,
      previousVolume: daily?.volume ?? null,

      returnCloses: toReturnCloses(returnCloses.get(member.instrumentId)),
      signal: toRowSignal(signals.get(member.instrumentId)),
      setup: toRowSetup(setups.get(member.instrumentId)),
    };
  });

  const layout: WatchlistLayoutDto =
    storedLayout === null
      ? defaultLayout()
      : {
          columns: storedLayout.columns,
          sort: (storedLayout.sort ?? []) as WatchlistLayoutDto['sort'],
          filters: (storedLayout.filters ?? {}) as WatchlistFilterStateDto,
          quickView: storedLayout.quickView,
        };

  return {
    watchlist,
    rows,
    layout,
    savedViews: storedViews.map(toSavedViewDto),
    market: { isOpen: market?.isOpen ?? false, phase: market?.phase ?? 'unknown' },
    fetchedAt: now.toISOString(),
    missingQuotes,
    quotesStale,
    refreshAfterSeconds: market?.isOpen === true ? REFRESH_OPEN_SECONDS : REFRESH_CLOSED_SECONDS,
  };
}

/**
 * Today's live intraday setups, keyed by instrument.
 *
 * Only TODAY's, and only non-terminal ones: a setup that ended on Friday is not
 * a level worth showing beside Monday's price.
 *
 * The intraday tables may be empty, or the engine may never have run for this
 * name; that is an absent setup, not an error, and it must not fail the whole
 * watchlist.
 */
async function liveSetupsFor(
  db: ReturnType<typeof getDatabase>,
  instrumentIds: readonly number[],
  now: Date,
): Promise<Map<number, InstrumentSetup>> {
  try {
    return await liveSetupsForInstruments(db, istDateKey(now), instrumentIds);
  } catch {
    return new Map();
  }
}

const SIGNAL_DIRECTIONS: readonly SignalDirection[] = [
  'strong_bullish',
  'bullish',
  'neutral',
  'bearish',
  'strong_bearish',
];

/**
 * Narrows the stored direction string to the UI's closed set.
 *
 * The column is a badge with five states; a sixth value from a future engine
 * would render as an unstyled string rather than as a signal, so an
 * unrecognised direction is treated as no signal at all.
 */
function toRowSignal(stored: InstrumentSignal | undefined): RowSignalDto | null {
  if (stored === undefined) return null;
  const direction = SIGNAL_DIRECTIONS.find((entry) => entry === stored.direction);
  if (direction === undefined) return null;

  return {
    direction,
    strength: stored.strength,
    setups: stored.setups,
    tradingDate: stored.tradingDate,
  };
}

/** The level columns of a live setup. Levels only — never an order. */
function toRowSetup(stored: InstrumentSetup | undefined): RowSetupDto | null {
  if (stored === undefined) return null;
  return {
    kind: stored.kind,
    direction: stored.direction,
    state: stored.state,
    score: stored.score,
    quality: stored.quality,
    entryLow: stored.entryLow,
    entryHigh: stored.entryHigh,
    invalidationLevel: stored.invalidationLevel,
    target1: stored.target1,
    // NET of the modelled round trip: the gross figure must never be published.
    netRiskReward: stored.netRiskReward,
  };
}

function toReturnCloses(closes: Map<string, number> | undefined): ReturnCloses {
  return closes === undefined ? {} : Object.fromEntries(closes);
}

async function fetchQuotesFor(
  members: readonly { symbol: string; kind: string }[],
): Promise<QuotesResult> {
  const provider = await getProvider();
  const refs: InstrumentRef[] = members.map((member) => ({
    symbol: member.symbol,
    exchange: 'NSE',
    kind: member.kind === 'index' ? 'index' : 'equity',
  }));
  return provider.fetchQuotes(refs);
}

function toSavedViewDto(view: {
  id: number;
  watchlistId: number | null;
  name: string;
  columns: readonly string[];
  sort: unknown;
  filters: unknown;
}): SavedViewDto {
  return {
    id: view.id,
    watchlistId: view.watchlistId,
    name: view.name,
    columns: view.columns,
    sort: (view.sort ?? []) as SavedViewDto['sort'],
    filters: (view.filters ?? {}) as WatchlistFilterStateDto,
  };
}

export interface DefaultMembersDto {
  readonly watchlistId: number | null;
  readonly members: readonly { readonly instrumentId: number; readonly symbol: string }[];
}

/**
 * The default watchlist's membership, with no quote fetch.
 *
 * Serves the star toggles scattered across the dashboard. Those need the set of
 * followed symbols and the ids to remove them by — never a price, which the
 * surface they sit on has already fetched for its own reasons.
 */
export async function getDefaultWatchlistMembers(): Promise<DefaultMembersDto> {
  const db = getDatabase();
  const all = await listWatchlists(db);
  const target = all.find((entry) => entry.isDefault) ?? all[0];
  if (target === undefined) return { watchlistId: null, members: [] };

  const members = await getWatchlistMembers(db, target.id);
  return {
    watchlistId: target.id,
    members: members.map((member) => ({
      instrumentId: member.instrumentId,
      symbol: member.symbol,
    })),
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function addWatchlist(name: string): Promise<WatchlistSummaryDto> {
  const created = await createWatchlist(getDatabase(), { name });
  return {
    id: created.id,
    name: created.name,
    position: created.position,
    isDefault: created.isDefault,
    count: created.count,
    updatedAt: created.updatedAt.toISOString(),
  };
}

export async function updateWatchlist(
  id: number,
  patch: { name?: string | undefined; isDefault?: boolean | undefined },
): Promise<boolean> {
  const db = getDatabase();
  let touched = false;
  if (patch.name !== undefined) touched = (await renameWatchlist(db, id, patch.name)) || touched;
  if (patch.isDefault === true) touched = (await setDefaultWatchlist(db, id)) || touched;
  return touched;
}

export async function removeWatchlist(id: number): Promise<boolean> {
  return deleteWatchlist(getDatabase(), id);
}

export async function reorder(ids: readonly number[]): Promise<void> {
  await reorderWatchlists(getDatabase(), ids);
}

export interface AddSymbolsResult {
  readonly added: readonly string[];
  /** Already present — reported so the UI can say so rather than silently no-op. */
  readonly duplicates: readonly string[];
  /** Not resolvable to an instrument at all. */
  readonly unknown: readonly string[];
}

/**
 * Adds symbols to a watchlist, creating instrument rows as needed.
 *
 * A watchlist may hold any NSE name, including ones outside the worker's
 * ingestion universe, so the instrument row often does not exist yet.
 * `ensureInstruments` creates it; the row then has no candles and no
 * indicators, and the table shows a live quote with empty indicator columns —
 * which is the truth about that name until ingestion covers it.
 */
export async function addSymbols(
  watchlistId: number,
  symbols: readonly string[],
): Promise<AddSymbolsResult> {
  const db = getDatabase();

  const resolved: { symbol: string; name: string; kind: 'equity' | 'index' }[] = [];
  const unknown: string[] = [];

  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    if (symbol === '') continue;
    const match = await resolveSymbol(symbol);
    if (match === null) {
      unknown.push(symbol);
      continue;
    }
    resolved.push({ symbol: match.symbol, name: match.name, kind: match.kind });
  }

  if (resolved.length === 0) return { added: [], duplicates: [], unknown };

  const provider = await getProvider().catch(() => null);
  const ids = await ensureInstruments(db, provider?.id ?? 'fyers', resolved, 'NSE');

  const instrumentIds: number[] = [];
  const bySymbol = new Map<number, string>();
  for (const entry of resolved) {
    const id = ids.get(entry.symbol);
    if (id === undefined) continue;
    instrumentIds.push(id);
    bySymbol.set(id, entry.symbol);
  }

  const insertedIds = await addWatchlistItems(db, watchlistId, instrumentIds);
  const inserted = new Set(insertedIds);

  return {
    added: insertedIds.map((id) => bySymbol.get(id) ?? '').filter((symbol) => symbol !== ''),
    duplicates: instrumentIds
      .filter((id) => !inserted.has(id))
      .map((id) => bySymbol.get(id) ?? '')
      .filter((symbol) => symbol !== ''),
    unknown,
  };
}

export async function removeSymbols(
  watchlistId: number,
  instrumentIds: readonly number[],
): Promise<number> {
  return removeWatchlistItems(getDatabase(), watchlistId, instrumentIds);
}

export async function reorderSymbols(
  watchlistId: number,
  instrumentIds: readonly number[],
): Promise<void> {
  await reorderWatchlistItems(getDatabase(), watchlistId, instrumentIds);
}

export async function saveLayout(watchlistId: number, layout: WatchlistLayoutDto): Promise<void> {
  await saveWatchlistLayout(getDatabase(), watchlistId, {
    columns: layout.columns,
    sort: layout.sort,
    filters: layout.filters,
    quickView: layout.quickView,
  });
}

export async function saveView(input: {
  watchlistId: number | null;
  name: string;
  columns: readonly string[];
  sort: WatchlistLayoutDto['sort'];
  filters: WatchlistFilterStateDto;
}): Promise<SavedViewDto> {
  return toSavedViewDto(await saveWatchlistView(getDatabase(), input));
}

export async function removeView(id: number): Promise<boolean> {
  return deleteWatchlistView(getDatabase(), id);
}

/** Narrows an unknown failure to the shared market-error shape. */
export { toMarketError };
