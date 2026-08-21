import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { instruments, signalFactors, signals, strategyVersions } from '../schema/index.js';

/**
 * Signal persistence.
 *
 * Two hard rules live here:
 *
 *  - A strategy version is immutable (rule 7). Changing a weight mints a new
 *    row; `registerStrategy` is idempotent on the config digest, so calling it
 *    every run is free and cannot fork one strategy's history in two.
 *  - Every signal writes its factor breakdown (rule 8). `saveSignal` writes
 *    both in one transaction — a signal without its factors would leave the
 *    "why?" UI with nothing to read and no way to know it was truncated.
 */

/**
 * Stable digest of a strategy config.
 *
 * Keys are sorted recursively before hashing, so two configs that differ only
 * in property order are recognised as the same strategy rather than minting a
 * spurious second version every time the object is rebuilt.
 */
export function hashStrategyConfig(config: unknown): string {
  return createHash('sha256').update(canonicalize(config)).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, v]) => `${JSON.stringify(key)}:${canonicalize(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Returns the id for this exact config, inserting it if new.
 *
 * Idempotent by digest, so the ingestion job can call it on every run.
 */
export async function registerStrategy(
  db: Database,
  name: string,
  config: unknown,
  note?: string,
): Promise<number> {
  const configHash = hashStrategyConfig(config);

  const [existing] = await db
    .select({ id: strategyVersions.id })
    .from(strategyVersions)
    .where(eq(strategyVersions.configHash, configHash))
    .limit(1);
  if (existing !== undefined) return existing.id;

  const [inserted] = await db
    .insert(strategyVersions)
    .values({ name, configHash, config, ...(note === undefined ? {} : { note }) })
    .onConflictDoNothing({ target: strategyVersions.configHash })
    .returning({ id: strategyVersions.id });
  if (inserted !== undefined) return inserted.id;

  // Lost a race with a concurrent registration; the winner's row is the answer.
  const [raced] = await db
    .select({ id: strategyVersions.id })
    .from(strategyVersions)
    .where(eq(strategyVersions.configHash, configHash))
    .limit(1);
  if (raced === undefined) {
    throw new Error(`registerStrategy: could not resolve strategy version for ${name}`);
  }
  return raced.id;
}

export interface SignalFactorInput {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly weight: number;
  readonly detail: string;
}

export interface SignalInput {
  readonly instrumentId: number;
  readonly strategyVersionId: number;
  /** IST date of the CLOSED session this was computed from. */
  readonly tradingDate: string;
  readonly direction: string;
  readonly strength: number;
  readonly bias: number;
  readonly setups: readonly string[];
  readonly close: number;
  readonly indicatorSnapshot: unknown;
  readonly factors: readonly SignalFactorInput[];
}

/**
 * Writes a signal and its factors atomically.
 *
 * Re-running the pass for the same (instrument, session, strategy) replaces the
 * verdict and its factors rather than accumulating duplicates.
 */
export async function saveSignal(db: Database, input: SignalInput): Promise<number> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(signals)
      .values({
        instrumentId: input.instrumentId,
        strategyVersionId: input.strategyVersionId,
        tradingDate: input.tradingDate,
        direction: input.direction,
        strength: input.strength,
        bias: input.bias,
        setups: [...input.setups],
        close: input.close,
        indicatorSnapshot: input.indicatorSnapshot,
      })
      .onConflictDoUpdate({
        target: [signals.instrumentId, signals.tradingDate, signals.strategyVersionId],
        set: {
          direction: sql`excluded.direction`,
          strength: sql`excluded.strength`,
          bias: sql`excluded.bias`,
          setups: sql`excluded.setups`,
          close: sql`excluded.close`,
          indicatorSnapshot: sql`excluded.indicator_snapshot`,
          computedAt: sql`now()`,
        },
      })
      .returning({ id: signals.id });

    if (row === undefined) throw new Error('saveSignal: insert returned no row');

    // Replace wholesale: a recomputation that produces fewer factors must not
    // leave the old ones behind, which would show evidence for a verdict that
    // no longer exists.
    await tx.delete(signalFactors).where(eq(signalFactors.signalId, row.id));
    if (input.factors.length > 0) {
      await tx.insert(signalFactors).values(
        input.factors.map((factor) => ({
          signalId: row.id,
          key: factor.key,
          label: factor.label,
          score: factor.score,
          weight: factor.weight,
          detail: factor.detail,
        })),
      );
    }

    return row.id;
  });
}

export interface StoredSignal {
  readonly id: number;
  readonly symbol: string;
  readonly name: string;
  readonly tradingDate: string;
  readonly direction: string;
  readonly strength: number;
  readonly setups: readonly string[];
  readonly close: number;
  readonly indicatorSnapshot: unknown;
}

/** Signals for a session, strongest first. */
export async function getSignalsForDate(
  db: Database,
  tradingDate: string,
  options: { direction?: string; limit?: number } = {},
): Promise<StoredSignal[]> {
  const conditions = [eq(signals.tradingDate, tradingDate)];
  if (options.direction !== undefined) conditions.push(eq(signals.direction, options.direction));

  return db
    .select({
      id: signals.id,
      symbol: instruments.symbol,
      name: instruments.name,
      tradingDate: signals.tradingDate,
      direction: signals.direction,
      strength: signals.strength,
      setups: signals.setups,
      close: signals.close,
      indicatorSnapshot: signals.indicatorSnapshot,
    })
    .from(signals)
    .innerJoin(instruments, eq(instruments.id, signals.instrumentId))
    .where(and(...conditions))
    .orderBy(desc(signals.strength))
    .limit(options.limit ?? 100);
}

/**
 * The stored factor breakdown for one signal.
 *
 * The "Why this signal?" UI reads this and never recomputes (hard rule 8) —
 * a recomputation can disagree with the stored verdict, which would mean
 * showing an explanation for a signal that was never produced.
 */
export async function getSignalFactors(
  db: Database,
  signalId: number,
): Promise<SignalFactorInput[]> {
  return db
    .select({
      key: signalFactors.key,
      label: signalFactors.label,
      score: signalFactors.score,
      weight: signalFactors.weight,
      detail: signalFactors.detail,
    })
    .from(signalFactors)
    .where(eq(signalFactors.signalId, signalId));
}
