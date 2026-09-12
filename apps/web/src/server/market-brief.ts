import 'server-only';
import {
  type BriefFactorRow,
  type BriefIndicatorRow,
  type BriefSignalRow,
  factorsForSignals,
  getDailyBars,
  getInstrumentBySymbol,
  indicatorsForInstrumentsOnDate,
  listWatchlists,
  ownerHasWatchlists,
  recentIndicatorSessions,
  resolveInstrumentIds,
  signalsForInstrumentsOnDate,
  watchlistMembershipForOwner,
} from '@equitywise/db';
import {
  type BriefDirection,
  type BriefSignalFactor,
  type BriefWatchlistRef,
  buildMarketBrief,
  type DailyMarketBrief,
  expectedLatestSession,
  type MarketBriefInput,
  type SessionInstrumentFacts,
  type SessionSignalFacts,
} from '@/lib/market-brief';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';
import { getHeadlineIndices, getIndex, listIndexKeys } from './indices';

/**
 * The Daily Market Brief server service (`/today`).
 *
 * Assembles a typed read model from data the worker already persisted — daily
 * indicators, signals, factors — plus the signed-in user's watchlist
 * membership. It never calls Fyers, never mints a credential, and never
 * recomputes an indicator or a signal. The deterministic summarisation lives in
 * the pure `@/lib/market-brief` module; this layer only fetches, shapes, and
 * scopes the data to the current user.
 *
 * Data is fetched in a small, bounded set of set-based queries (no N+1): two
 * indicator reads, two signal reads, one factor read, one membership read, and
 * one index-return read, run in parallel.
 */

const DIRECTIONS: ReadonlySet<string> = new Set([
  'strong_bullish',
  'bullish',
  'neutral',
  'bearish',
  'strong_bearish',
]);

function toDirection(value: string): BriefDirection | null {
  return DIRECTIONS.has(value) ? (value as BriefDirection) : null;
}

export interface MarketBriefResponse {
  readonly brief: DailyMarketBrief;
  /** The user's default watchlist, for the add-to-watchlist controls. Null when none. */
  readonly defaultWatchlistId: number | null;
}

async function requireOwnerId(): Promise<number> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  return user.id;
}

interface UniverseEntry {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string | null;
}

/** The distinct equity universe across every configured index. */
async function loadUniverse(): Promise<Map<string, UniverseEntry>> {
  const bySymbol = new Map<string, UniverseEntry>();
  for (const key of await listIndexKeys()) {
    const index = await getIndex(key);
    if (index === null) continue;
    for (const constituent of index.constituents) {
      if (!bySymbol.has(constituent.symbol)) {
        bySymbol.set(constituent.symbol, {
          symbol: constituent.symbol,
          name: constituent.name,
          sector: constituent.sector,
        });
      }
    }
  }
  return bySymbol;
}

/** The benchmark index's session return, percent. Null when unavailable. */
async function indexReturn(): Promise<{ name: string | null; returnPercent: number | null }> {
  try {
    const headlines = await getHeadlineIndices();
    const benchmark = headlines.find((h) => h.display === 'index') ?? headlines[0];
    if (benchmark === undefined) return { name: null, returnPercent: null };

    const db = getDatabase();
    const instrument = await getInstrumentBySymbol(db, benchmark.symbol);
    if (instrument === null) return { name: benchmark.name, returnPercent: null };

    const bars = await getDailyBars(db, {
      instrumentId: instrument.id,
      from: new Date(0),
      to: new Date(),
      limit: 2,
    });
    if (bars.length < 2) return { name: benchmark.name, returnPercent: null };

    const previous = bars[0];
    const latest = bars[1];
    if (previous === undefined || latest === undefined || previous.close === 0) {
      return { name: benchmark.name, returnPercent: null };
    }
    const returnPercent = ((latest.close - previous.close) / previous.close) * 100;
    return { name: benchmark.name, returnPercent };
  } catch {
    return { name: null, returnPercent: null };
  }
}

export async function getMarketBrief(now: Date = new Date()): Promise<MarketBriefResponse> {
  const ownerId = await requireOwnerId();
  const db = getDatabase();

  const universe = await loadUniverse();
  const expectedInstruments = universe.size;
  const symbolIds = await resolveInstrumentIds(db, [...universe.keys()]);
  const instrumentIds = [...symbolIds.values()];

  const [sessions, hasWatchlists, allWatchlists] = await Promise.all([
    recentIndicatorSessions(db, 2),
    ownerHasWatchlists(db, ownerId),
    listWatchlists(db, ownerId),
  ]);
  const defaultWatchlistId =
    allWatchlists.find((w) => w.isDefault)?.id ?? allWatchlists[0]?.id ?? null;

  const latest = sessions[0];
  const previous = sessions[1];

  // No completed session at all — return a coherent "unavailable" brief rather
  // than an empty calendar day. The pure builder resolves the status.
  if (latest === undefined) {
    const emptyInput: MarketBriefInput = {
      sessionDate: expectedLatestSession(now),
      previousSessionDate: null,
      completedAt: null,
      now,
      expectedInstruments,
      current: new Map(),
      previous: new Map(),
      currentSignals: new Map(),
      previousSignals: new Map(),
      watchlistMembership: new Map(),
      hasWatchlists,
      indexReturnPercent: null,
      indexName: null,
    };
    return { brief: buildMarketBrief(emptyInput), defaultWatchlistId };
  }

  const emptyIndicators = Promise.resolve(new Map<number, BriefIndicatorRow>());
  const emptySignals = Promise.resolve(new Map<number, BriefSignalRow>());
  const [
    currentIndicators,
    previousIndicators,
    currentSignalRows,
    previousSignalRows,
    membership,
    index,
  ] = await Promise.all([
    indicatorsForInstrumentsOnDate(db, instrumentIds, latest.tradingDate),
    previous === undefined
      ? emptyIndicators
      : indicatorsForInstrumentsOnDate(db, instrumentIds, previous.tradingDate),
    signalsForInstrumentsOnDate(db, instrumentIds, latest.tradingDate),
    previous === undefined
      ? emptySignals
      : signalsForInstrumentsOnDate(db, instrumentIds, previous.tradingDate),
    watchlistMembershipForOwner(db, ownerId, instrumentIds),
    indexReturn(),
  ]);

  const currentSignalIds = [...currentSignalRows.values()].map((s) => s.signalId);
  const factorsBySignal = await factorsForSignals(db, currentSignalIds);

  const idToSymbol = new Map<number, string>();
  for (const [symbol, id] of symbolIds) idToSymbol.set(id, symbol);

  const sectorOf = (symbol: string): string | null => universe.get(symbol)?.sector ?? null;

  const toFacts = (rows: Map<number, BriefIndicatorRow>): Map<number, SessionInstrumentFacts> => {
    const map = new Map<number, SessionInstrumentFacts>();
    for (const [instrumentId, row] of rows) {
      map.set(instrumentId, {
        instrumentId,
        symbol: row.symbol,
        name: row.name,
        sector: sectorOf(row.symbol),
        close: row.close,
        changePercent: row.changePercent,
        sma20: row.sma20,
        sma50: row.sma50,
        rsi14: row.rsi14,
        macdHistogram: row.macdHistogram,
        relativeVolume: row.relativeVolume,
        barCount: row.barCount,
      });
    }
    return map;
  };

  const toSignals = (
    rows: Map<number, BriefSignalRow>,
    withFactors: boolean,
  ): Map<number, SessionSignalFacts> => {
    const map = new Map<number, SessionSignalFacts>();
    for (const [instrumentId, row] of rows) {
      const direction = toDirection(row.direction);
      if (direction === null) continue;
      map.set(instrumentId, {
        signalId: row.signalId,
        direction,
        strength: row.strength,
        setups: row.setups,
        close: row.close,
        factors: withFactors ? toFactors(factorsBySignal.get(row.signalId) ?? []) : [],
      });
    }
    return map;
  };

  const membershipRefs = new Map<number, readonly BriefWatchlistRef[]>();
  for (const [instrumentId, refs] of membership) {
    membershipRefs.set(
      instrumentId,
      refs.map((ref) => ({ watchlistId: ref.watchlistId, name: ref.name })),
    );
  }

  const input: MarketBriefInput = {
    sessionDate: latest.tradingDate,
    previousSessionDate: previous?.tradingDate ?? null,
    completedAt: latest.completedAt === null ? null : latest.completedAt.toISOString(),
    now,
    expectedInstruments,
    current: toFacts(currentIndicators),
    previous: toFacts(previousIndicators),
    currentSignals: toSignals(currentSignalRows, true),
    previousSignals: toSignals(previousSignalRows, false),
    watchlistMembership: membershipRefs,
    hasWatchlists,
    indexReturnPercent: index.returnPercent,
    indexName: index.name,
  };

  return { brief: buildMarketBrief(input), defaultWatchlistId };
}

/** Maps stored factor rows to the wire shape. */
function toFactors(rows: readonly BriefFactorRow[]): BriefSignalFactor[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    score: row.score,
    weight: row.weight,
    detail: row.detail,
  }));
}
