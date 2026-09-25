import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { corporateActions, instruments } from '../schema/index.js';

/**
 * The instrument universe.
 *
 * Symbols are OUR symbols. `providerRef` is opaque here — this layer never
 * parses it and never constructs one.
 */

export interface InstrumentRow {
  readonly id: number;
  readonly symbol: string;
  readonly name: string;
  readonly kind: string;
  readonly exchange: string;
  readonly isin: string | null;
  readonly series: string | null;
  readonly active: boolean;
}

export interface InstrumentUpsert {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'equity' | 'index';
  readonly exchange: string;
  readonly isin: string | null;
  readonly lotSize: number;
  readonly tickSize: number;
  readonly providerRef: string | null;
}

const UPSERT_CHUNK = 1_000;

/**
 * Syncs the universe from a provider listing.
 *
 * Instruments that disappear are marked inactive, never deleted: their candles
 * remain valid history, and removing them would introduce survivorship bias
 * into every backtest that scans the universe.
 *
 * @returns counts of what changed.
 */
export async function syncInstruments(
  db: Database,
  providerId: string,
  listing: readonly InstrumentUpsert[],
): Promise<{ upserted: number; deactivated: number }> {
  if (listing.length === 0) return { upserted: 0, deactivated: 0 };

  let upserted = 0;
  for (let i = 0; i < listing.length; i += UPSERT_CHUNK) {
    const chunk = listing.slice(i, i + UPSERT_CHUNK).map((row) => ({ ...row, providerId }));
    if (chunk.length === 0) continue;

    const result = await db
      .insert(instruments)
      .values(chunk)
      .onConflictDoUpdate({
        target: [instruments.symbol, instruments.exchange],
        set: {
          name: sql`excluded.name`,
          kind: sql`excluded.kind`,
          isin: sql`excluded.isin`,
          lotSize: sql`excluded.lot_size`,
          tickSize: sql`excluded.tick_size`,
          providerRef: sql`excluded.provider_ref`,
          providerId: sql`excluded.provider_id`,
          active: sql`true`,
          lastSeenAt: sql`now()`,
        },
      })
      .returning({ id: instruments.id });
    upserted += result.length;
  }

  // Anything this provider knew about before but did not list this time —
  // compared per LISTING, so RELIANCE on NSE does not keep a delisted BSE
  // RELIANCE alive, or the reverse.
  const seen = listing.map((row) => `${row.exchange}:${row.symbol}`);
  const deactivated = await db
    .update(instruments)
    .set({ active: false })
    .where(
      and(
        eq(instruments.providerId, providerId),
        eq(instruments.active, true),
        sql`(${instruments.exchange} || ':' || ${instruments.symbol}) <> ALL(${seen})`,
      ),
    )
    .returning({ id: instruments.id });

  return { upserted, deactivated: deactivated.length };
}

/** One exchange listing, as an exchange file (bhavcopy) describes it. */
export interface ListingUpsert {
  readonly symbol: string;
  readonly name: string;
  readonly exchange: string;
  readonly isin: string;
  /** BSE scrip code, NSE token. */
  readonly exchangeCode: string;
  /** NSE series or BSE group. */
  readonly series: string;
}

/**
 * Creates or refreshes equity listings from an exchange file, returning each
 * listing's id keyed by `exchangeCode`.
 *
 * Metadata only — name, ISIN, code, series, last seen. Tick size and lot size
 * are left as the provider sync set them (the file carries neither); a new
 * row starts at 1 paise / 1 share until it does. Never deactivates: one
 * day's file lists only names that TRADED, and a quiet day is not a delisting.
 */
export async function upsertListings(
  db: Database,
  providerId: string,
  listings: readonly ListingUpsert[],
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (let i = 0; i < listings.length; i += UPSERT_CHUNK) {
    const chunk = listings.slice(i, i + UPSERT_CHUNK).map((row) => ({
      symbol: row.symbol,
      name: row.name,
      kind: 'equity',
      exchange: row.exchange,
      isin: row.isin,
      exchangeCode: row.exchangeCode,
      series: row.series,
      lotSize: 1,
      tickSize: 1,
      providerRef: null,
      providerId,
    }));
    if (chunk.length === 0) continue;
    const result = await db
      .insert(instruments)
      .values(chunk)
      .onConflictDoUpdate({
        target: [instruments.symbol, instruments.exchange],
        set: {
          isin: sql`excluded.isin`,
          exchangeCode: sql`excluded.exchange_code`,
          series: sql`excluded.series`,
          active: sql`true`,
          lastSeenAt: sql`now()`,
        },
      })
      .returning({ id: instruments.id, exchangeCode: instruments.exchangeCode });
    for (const row of result) {
      if (row.exchangeCode !== null) ids.set(row.exchangeCode, row.id);
    }
  }
  return ids;
}

/** Resolves symbols to ids in one query. Missing symbols are simply absent. */
export async function resolveInstrumentIds(
  db: Database,
  symbols: readonly string[],
  exchange = 'NSE',
): Promise<Map<string, number>> {
  if (symbols.length === 0) return new Map();

  const rows = await db
    .select({ id: instruments.id, symbol: instruments.symbol })
    .from(instruments)
    .where(and(inArray(instruments.symbol, [...symbols]), eq(instruments.exchange, exchange)));

  return new Map(rows.map((row) => [row.symbol, row.id]));
}

/**
 * Ensures rows exist for the given symbols, returning their ids.
 *
 * For symbols that come from `config/indices.yaml` before a universe sync has
 * run — ingestion must not be blocked on the full instrument listing.
 */
export async function ensureInstruments(
  db: Database,
  providerId: string,
  refs: readonly { symbol: string; name: string; kind: 'equity' | 'index' }[],
  exchange = 'NSE',
): Promise<Map<string, number>> {
  if (refs.length === 0) return new Map();

  await db
    .insert(instruments)
    .values(
      refs.map((ref) => ({
        symbol: ref.symbol,
        name: ref.name,
        kind: ref.kind,
        exchange,
        isin: null,
        lotSize: 1,
        // A placeholder until the universe sync supplies the real increment.
        // 5 paise is the NSE default for most equities.
        tickSize: 5,
        providerRef: null,
        providerId,
      })),
    )
    .onConflictDoNothing({ target: [instruments.symbol, instruments.exchange] });

  return resolveInstrumentIds(
    db,
    refs.map((ref) => ref.symbol),
    exchange,
  );
}

/** Active instruments, for the ingestion universe. */
export async function listActiveInstruments(
  db: Database,
  kind?: 'equity' | 'index',
): Promise<InstrumentRow[]> {
  const conditions = [eq(instruments.active, true)];
  if (kind !== undefined) conditions.push(eq(instruments.kind, kind));

  return db
    .select({
      id: instruments.id,
      symbol: instruments.symbol,
      name: instruments.name,
      kind: instruments.kind,
      exchange: instruments.exchange,
      isin: instruments.isin,
      series: instruments.series,
      active: instruments.active,
    })
    .from(instruments)
    .where(and(...conditions));
}

export interface CorporateActionRow {
  readonly kind: string;
  readonly exDate: string;
  readonly ratio: string;
  readonly note: string | null;
}

export async function listCorporateActions(
  db: Database,
  instrumentId: number,
  limit = 10,
): Promise<CorporateActionRow[]> {
  return db
    .select({
      kind: corporateActions.kind,
      exDate: corporateActions.exDate,
      ratio: corporateActions.ratio,
      note: corporateActions.note,
    })
    .from(corporateActions)
    .where(eq(corporateActions.instrumentId, instrumentId))
    .orderBy(desc(corporateActions.exDate))
    .limit(limit);
}

/** Id, symbol and name for a set of instrument ids. Unknown ids are absent. */
export async function listInstrumentsById(
  db: Database,
  ids: readonly number[],
): Promise<{ id: number; symbol: string; name: string }[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: instruments.id, symbol: instruments.symbol, name: instruments.name })
    .from(instruments)
    .where(inArray(instruments.id, [...ids]));
}

export async function getInstrumentBySymbol(
  db: Database,
  symbol: string,
  exchange = 'NSE',
): Promise<{
  id: number;
  symbol: string;
  name: string;
  isin: string | null;
  exchange: string;
} | null> {
  const [row] = await db
    .select({
      id: instruments.id,
      symbol: instruments.symbol,
      name: instruments.name,
      isin: instruments.isin,
      exchange: instruments.exchange,
    })
    .from(instruments)
    .where(and(eq(instruments.symbol, symbol), eq(instruments.exchange, exchange)))
    .limit(1);

  return row ?? null;
}
