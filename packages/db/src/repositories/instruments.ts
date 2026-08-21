import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { instruments } from '../schema/index.js';

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

  // Anything this provider knew about before but did not list this time.
  const seen = listing.map((row) => row.symbol);
  const deactivated = await db
    .update(instruments)
    .set({ active: false })
    .where(
      and(
        eq(instruments.providerId, providerId),
        eq(instruments.active, true),
        sql`${instruments.symbol} <> ALL(${seen})`,
      ),
    )
    .returning({ id: instruments.id });

  return { upserted, deactivated: deactivated.length };
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
      active: instruments.active,
    })
    .from(instruments)
    .where(and(...conditions));
}
