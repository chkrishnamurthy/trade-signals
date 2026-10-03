import {
  type FieldObservation,
  lifecycleFromSourceStatus,
  parseIssueSize,
  resolveFields,
} from '@equitywise/core';
import {
  type Database,
  type IpoIssuePatch,
  latestObservationsForIssue,
  type SourceObservationRow,
  updateIpoIssue,
} from '@equitywise/db';
import type { FactSource, IpoExchange, IpoLifecycleOverride } from '@equitywise/shared';
import type { IpoSourcesConfig } from '../../sources/ipo/config.js';

/**
 * Rebuilding one canonical `ipo_issues` row from everything the official
 * sources have said about it (docs/planning/ipos-plan.md §6.3).
 *
 * Within ONE source, the more specific feed wins a field (the detail page over
 * the past list over the calendar); ACROSS sources, core's `resolveFields`
 * ranks the designated exchange first and marks disagreements as conflicts.
 * Aggregator data never reaches this file — GMP has its own table.
 */

/** Feed precedence within one source. */
const FEED_RANK: Readonly<Record<string, number>> = {
  detail: 4,
  past: 3,
  recent: 3,
  calendar: 2,
};

const EQUITYWISE = 'equitywise';

type Payload = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strArray = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')
    ? (v as string[])
    : null;

function band(p: Payload): { low: number | null; high: number | null } {
  const b = p.priceBand;
  if (b === null || typeof b !== 'object') return { low: null, high: null };
  const o = b as Record<string, unknown>;
  return { low: num(o.lowPaise), high: num(o.highPaise) };
}

/** The fields one stored observation speaks to, by feed. */
function fieldsOf(row: SourceObservationRow): Record<string, unknown> {
  const p = row.payload;
  const { low, high } = band(p);
  switch (row.feed) {
    case 'calendar':
    case 'past':
      return {
        companyName: str(p.companyName),
        board: str(p.board),
        nseSymbol: row.source === 'nse' ? str(p.symbol) : null,
        nseSeries: row.source === 'nse' ? str(p.series) : null,
        bseScripCode:
          row.source === 'bse' ? (str(p.bseScripCode) ?? str(p.symbol)) : str(p.bseScripCode),
        isin: str(p.isin),
        openDate: str(p.openDate),
        closeDate: str(p.closeDate),
        listingDate: str(p.listingDate),
        priceBandLowPaise: low,
        priceBandHighPaise: high,
        issuePricePaise: num(p.issuePricePaise),
        lotSize: num(p.lotSize),
        sharesOffered: num(p.sharesOffered),
      };
    case 'detail':
      return {
        companyName: str(p.companyName),
        openDate: str(p.openDate),
        closeDate: str(p.closeDate),
        upiCutoffAt: str(p.upiCutoffAt),
        issueMethod: str(p.issueMethod),
        priceBandLowPaise: low,
        priceBandHighPaise: high,
        faceValuePaise: num(p.faceValuePaise),
        lotSize: num(p.lotSize),
        minBidQuantity: num(p.minBidQuantity),
        retailMaxPaise: num(p.retailMaxPaise),
        employeeDiscountPaise: num(p.employeeDiscountPaise),
        issueSizeText: str(p.issueSizeText),
        leadManagers: strArray(p.leadManagers),
        sponsorBanks: strArray(p.sponsorBanks),
        registrarName: str(p.registrarName),
        registrarContact: str(p.registrarContact),
        marketMaker: str(p.marketMaker),
      };
    case 'recent':
      return {
        isin: str(p.isin),
        listingDate: str(p.listingDate),
        issuePricePaise: num(p.issuePricePaise),
      };
    default:
      return {};
  }
}

/**
 * A source's lists do not agree on case: NSE's current-issue feed can say
 * `SRIT INDIA LIMITED` where its past-issue list says `Srit India Limited`.
 * An ALL-CAPS name yields to any properly cased one the same source gives.
 */
function fieldRank(field: string, value: unknown, feedRank: number): number {
  if (field === 'companyName' && typeof value === 'string' && !/\p{Ll}/u.test(value))
    return feedRank - 10;
  return feedRank;
}

/**
 * One observation per (field, source): the highest-ranked feed, then the most
 * recently seen. Exported for tests.
 */
export function observationsFrom(rows: readonly SourceObservationRow[]): FieldObservation[] {
  const best = new Map<string, { rank: number; obs: FieldObservation }>();
  for (const row of rows) {
    const feedRank = FEED_RANK[row.feed];
    if (feedRank === undefined) continue;
    for (const [field, value] of Object.entries(fieldsOf(row))) {
      if (value === null || value === undefined) continue;
      const rank = fieldRank(field, value, feedRank);
      const obs: FieldObservation = {
        field,
        value,
        source: row.source,
        url: row.sourceUrl,
        observedAt: row.lastSeenAt,
        basis: 'official',
      };
      const key = `${field}|${row.source}`;
      const prior = best.get(key);
      if (
        prior === undefined ||
        rank > prior.rank ||
        (rank === prior.rank && obs.observedAt.getTime() > prior.obs.observedAt.getTime())
      )
        best.set(key, { rank, obs });
    }
  }
  return [...best.values()].map((b) => b.obs);
}

/** Which exchanges list the issue, from the official sources that carry it. */
export function exchangesFrom(
  rows: readonly SourceObservationRow[],
  exchangeOf: Readonly<Record<string, IpoExchange>>,
): IpoExchange[] {
  const set = new Set<IpoExchange>();
  for (const row of rows) {
    const exchange = exchangeOf[row.source];
    if (exchange !== undefined && FEED_RANK[row.feed] !== undefined) set.add(exchange);
  }
  return [...set].sort();
}

/**
 * The lifecycle override the sources STATE, with its provenance. Each source's
 * latest observation that carries a status word speaks for it; the issue's
 * designated exchange is heard first, then the fallback order. A source that
 * now says "Active" clears an earlier "Postponed" — the override is rebuilt on
 * every resolve, never left behind. Exported for tests.
 */
export function lifecycleFrom(
  rows: readonly SourceObservationRow[],
  order: readonly string[],
): { override: IpoLifecycleOverride | null; provenance: FactSource | null } {
  const latest = new Map<string, SourceObservationRow>();
  for (const row of rows) {
    if (FEED_RANK[row.feed] === undefined || str(row.payload.sourceStatus) === null) continue;
    const prior = latest.get(row.source);
    if (prior === undefined || row.lastSeenAt.getTime() > prior.lastSeenAt.getTime())
      latest.set(row.source, row);
  }
  const sources = [
    ...order.filter((id) => latest.has(id)),
    ...[...latest.keys()].filter((id) => !order.includes(id)).sort(),
  ];
  const speaker = sources[0] === undefined ? undefined : latest.get(sources[0]);
  if (speaker === undefined) return { override: null, provenance: null };
  const override = lifecycleFromSourceStatus(str(speaker.payload.sourceStatus));
  return {
    override,
    provenance:
      override === null
        ? null
        : {
            source: speaker.source,
            url: speaker.sourceUrl,
            observedAt: speaker.lastSeenAt.toISOString(),
            basis: 'official',
          },
  };
}

/** The patch a set of observations resolves to, with provenance for every field. */
export function resolvePatch(
  rows: readonly SourceObservationRow[],
  config: IpoSourcesConfig,
  now: Date,
): IpoIssuePatch {
  const exchangeOf: Record<string, IpoExchange> = {};
  for (const [id, source] of Object.entries(config.sources))
    if (source.kind !== 'aggregator' && source.exchange !== undefined)
      exchangeOf[id] = source.exchange;

  const exchanges = exchangesFrom(rows, exchangeOf);
  // Without a stated designated exchange, NSE (the deeper market) is assumed
  // when the issue lists there; the field is marked derived either way.
  const designatedExchange: IpoExchange | null = exchanges.includes('NSE')
    ? 'NSE'
    : (exchanges[0] ?? null);
  const { fields } = resolveFields(observationsFrom(rows), {
    designatedExchange,
    exchangeOf,
    fallback: config.fieldPriority.fallback,
  });

  const sources: Record<string, FactSource> = {};
  const patch: Record<string, unknown> = {};
  for (const [field, resolved] of Object.entries(fields)) {
    patch[field] = field === 'upiCutoffAt' ? new Date(String(resolved.value)) : resolved.value;
    sources[field] = resolved.provenance;
  }

  // The issue-size sentence parsed into its parts — official, from the same source.
  const sizeText = fields.issueSizeText;
  if (sizeText !== undefined) {
    const parsed = parseIssueSize(String(sizeText.value));
    const parts: Record<string, number | null> = {
      freshIssueShares: parsed.fresh?.shares ?? null,
      freshIssuePaise: parsed.fresh?.paise ?? null,
      ofsShares: parsed.offerForSale?.shares ?? null,
      ofsPaise: parsed.offerForSale?.paise ?? null,
      marketMakerShares: parsed.marketMakerShares,
      anchorShares: parsed.anchorShares,
    };
    for (const [field, value] of Object.entries(parts)) {
      patch[field] = value;
      if (value !== null) sources[field] = sizeText.provenance;
    }
  }

  const derived: FactSource = {
    source: EQUITYWISE,
    url: '',
    observedAt: now.toISOString(),
    basis: 'derived',
  };
  patch.exchanges = exchanges;
  sources.exchanges = derived;
  patch.designatedExchange = designatedExchange;
  sources.designatedExchange = derived;

  // Withdrawn / postponed only when a source says so (null clears a stale one).
  const designatedSource = Object.entries(exchangeOf).find(
    ([, exchange]) => exchange === designatedExchange,
  )?.[0];
  const lifecycle = lifecycleFrom(rows, [
    ...(designatedSource === undefined ? [] : [designatedSource]),
    ...config.fieldPriority.fallback,
  ]);
  patch.lifecycleOverride = lifecycle.override;
  if (lifecycle.provenance !== null) sources.lifecycleOverride = lifecycle.provenance;

  // A board never changes once known; the resolver may not move an issue across boards.
  delete patch.board;

  return { ...(patch as Omit<IpoIssuePatch, 'fieldSources'>), fieldSources: sources };
}

/** Re-resolves one issue from its latest observations and writes the result. */
export async function resolveIssue(
  db: Database,
  ipoId: number,
  config: IpoSourcesConfig,
  now: Date,
): Promise<void> {
  const rows = await latestObservationsForIssue(db, ipoId);
  if (rows.length === 0) return;
  await updateIpoIssue(db, ipoId, resolvePatch(rows, config, now));
}
