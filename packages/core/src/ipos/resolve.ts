import type { FactBasis, FactSource, IpoExchange } from '@equitywise/shared';

/**
 * Building one canonical value per field from many sources' observations
 * (plan §6.3).
 *
 * Priority: the issue's DESIGNATED exchange first, then the other official
 * sources in the configured fallback order, then values EquityWise derived.
 * Within one source the most recent observation wins. When two official
 * sources disagree, the priority value is kept and marked `conflict` so the
 * page can say so — there is no numeric confidence score.
 *
 * Aggregators never appear here: GMP has its own table and its own type.
 */

export interface FieldObservation {
  readonly field: string;
  /** Any JSON-serialisable value; `null` observations are ignored. */
  readonly value: unknown;
  readonly source: string;
  readonly url: string;
  readonly observedAt: Date;
  readonly basis: 'official' | 'derived';
}

export interface SourceRanking {
  /** The exchange the issue lists on primarily; its source ranks first. */
  readonly designatedExchange: IpoExchange | null;
  /** Source id → the exchange it speaks for (`nse` → NSE). */
  readonly exchangeOf: Readonly<Record<string, IpoExchange>>;
  /** Fallback order for official sources, e.g. `['nse', 'bse', 'sebi']`. */
  readonly fallback: readonly string[];
}

export interface ResolvedField {
  readonly value: unknown;
  readonly provenance: FactSource;
}

export interface FieldConflict {
  readonly field: string;
  readonly chosen: { readonly source: string; readonly value: unknown };
  readonly others: readonly { readonly source: string; readonly value: unknown }[];
}

export interface Resolution {
  readonly fields: Readonly<Record<string, ResolvedField>>;
  readonly conflicts: readonly FieldConflict[];
}

/** Lower is better. Derived values always rank after every official one. */
export function sourceRank(source: string, basis: FactBasis, ranking: SourceRanking): number {
  if (basis === 'derived') return 10_000;
  const exchange = ranking.exchangeOf[source];
  if (ranking.designatedExchange !== null && exchange === ranking.designatedExchange) return 0;
  const index = ranking.fallback.indexOf(source);
  return index === -1 ? 1_000 : index + 1;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function resolveFields(
  observations: readonly FieldObservation[],
  ranking: SourceRanking,
): Resolution {
  const byField = new Map<string, FieldObservation[]>();
  for (const o of observations) {
    if (o.value === null || o.value === undefined) continue;
    const list = byField.get(o.field) ?? [];
    list.push(o);
    byField.set(o.field, list);
  }

  const fields: Record<string, ResolvedField> = {};
  const conflicts: FieldConflict[] = [];
  for (const [field, list] of byField) {
    // Latest observation per source first: a source's own correction wins.
    const latestPerSource = new Map<string, FieldObservation>();
    for (const o of list) {
      const prior = latestPerSource.get(o.source);
      if (prior === undefined || o.observedAt.getTime() > prior.observedAt.getTime())
        latestPerSource.set(o.source, o);
    }
    const ranked = [...latestPerSource.values()].sort(
      (a, b) =>
        sourceRank(a.source, a.basis, ranking) - sourceRank(b.source, b.basis, ranking) ||
        b.observedAt.getTime() - a.observedAt.getTime(),
    );
    const chosen = ranked[0];
    if (chosen === undefined) continue;
    const disagreeing = ranked
      .slice(1)
      .filter(
        (o) =>
          o.basis === 'official' && chosen.basis === 'official' && !same(o.value, chosen.value),
      );
    if (disagreeing.length > 0)
      conflicts.push({
        field,
        chosen: { source: chosen.source, value: chosen.value },
        others: disagreeing.map((o) => ({ source: o.source, value: o.value })),
      });
    fields[field] = {
      value: chosen.value,
      provenance: {
        source: chosen.source,
        url: chosen.url,
        observedAt: chosen.observedAt.toISOString(),
        basis: disagreeing.length > 0 ? 'conflict' : chosen.basis,
      },
    };
  }
  return { fields, conflicts };
}
