import 'server-only';
import {
  type BriefFactorRow,
  type BriefIndicatorRow,
  type BriefSignalRow,
  factorsForSignals,
  getDailyBars,
  getInstrumentBySymbol,
  indicatorsForInstrumentsOnDate,
  listOwnerWatchedInstrumentIds,
  listWatchlists,
  ownerHasWatchlists,
  recentIndicatorSessions,
  resolveInstrumentIds,
  signalsForInstrumentsOnDate,
  snapshotsForInstrumentsOnDate,
  watchlistMembershipForOwner,
} from '@equitywise/db';
import {
  type BreadthMarketRead,
  type BriefDirection,
  type BriefSignalFactor,
  type BriefWatchlistRef,
  buildBreadthMarketRead,
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
import { getMarketBreadthData, type MarketBreadthDto } from './market-breadth';

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
  readonly breadth: MarketBreadthDto;
  readonly marketRead: BreadthMarketRead;
  readonly personalMovers: readonly PersonalMoverDto[];
  /** The user's default watchlist, for the add-to-watchlist controls. Null when none. */
  readonly defaultWatchlistId: number | null;
}

export interface PersonalMoverDto {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly name: string;
  readonly closePaise: number;
  readonly sessionReturn: number | null;
  readonly watchlists: readonly BriefWatchlistRef[];
}

async function requireOwner(): Promise<{ id: number; isAdmin: boolean }> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  return { id: user.id, isAdmin: user.role === 'admin' };
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
async function indexReturn(
  sessionDate: string,
): Promise<{ name: string | null; returnPercent: number | null }> {
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
      // The page describes one completed session. Never let a newer stored bar
      // leak into an older/stale brief.
      to: new Date(`${sessionDate}T23:59:59.999+05:30`),
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

export async function getMarketBrief(
  breadthUniverse: 'all' | 'nifty500' = 'all',
  now: Date = new Date(),
): Promise<MarketBriefResponse> {
  const { id: ownerId, isAdmin } = await requireOwner();
  const db = getDatabase();

  const [universe, breadth, sessions, hasWatchlists, allWatchlists, watchedInstrumentIds] =
    await Promise.all([
      loadUniverse(),
      getMarketBreadthData(breadthUniverse),
      recentIndicatorSessions(db, 2),
      ownerHasWatchlists(db, ownerId),
      listWatchlists(db, ownerId),
      listOwnerWatchedInstrumentIds(db, ownerId),
    ]);
  const expectedInstruments = universe.size;
  const symbolIds = await resolveInstrumentIds(db, [...universe.keys()]);
  const instrumentIds = [...symbolIds.values()];

  const defaultWatchlistId =
    allWatchlists.find((w) => w.isDefault)?.id ?? allWatchlists[0]?.id ?? null;

  const [personalRows, personalMembership] =
    breadth.session === null
      ? [[], new Map<number, BriefWatchlistRef[]>()]
      : await Promise.all([
          snapshotsForInstrumentsOnDate(db, breadth.session, watchedInstrumentIds),
          watchlistMembershipForOwner(db, ownerId, watchedInstrumentIds),
        ]);
  const personalMovers: PersonalMoverDto[] = personalRows
    .map((row) => ({
      instrumentId: row.instrumentId,
      symbol: row.symbol,
      name: row.name,
      closePaise: row.close,
      sessionReturn: row.changePct,
      watchlists: personalMembership.get(row.instrumentId) ?? [],
    }))
    .sort((a, b) => Math.abs(b.sessionReturn ?? 0) - Math.abs(a.sessionReturn ?? 0))
    .slice(0, 12);
  const latestBreadth = breadth.history[breadth.history.length - 1] ?? null;
  const marketRead = buildBreadthMarketRead(latestBreadth);

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
      includeSignals: isAdmin,
      watchlistMembership: new Map(),
      hasWatchlists,
      indexReturnPercent: null,
      indexName: null,
    };
    return {
      brief: buildMarketBrief(emptyInput),
      breadth,
      marketRead,
      personalMovers,
      defaultWatchlistId,
    };
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
    // Signals are admin-only (CLAUDE.md): nobody else's brief reads them, so
    // no signal badge, strength or setup can reach a user's screen.
    isAdmin ? signalsForInstrumentsOnDate(db, instrumentIds, latest.tradingDate) : emptySignals,
    !isAdmin || previous === undefined
      ? emptySignals
      : signalsForInstrumentsOnDate(db, instrumentIds, previous.tradingDate),
    watchlistMembershipForOwner(db, ownerId, instrumentIds),
    indexReturn(breadth.session ?? latest.tradingDate),
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
    includeSignals: isAdmin,
    watchlistMembership: membershipRefs,
    hasWatchlists,
    indexReturnPercent: index.returnPercent,
    indexName: index.name,
  };

  return {
    brief: buildMarketBrief(input),
    breadth,
    marketRead,
    personalMovers,
    defaultWatchlistId,
  };
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
