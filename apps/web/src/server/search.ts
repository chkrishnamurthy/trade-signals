import 'server-only';
import type { Instrument, InstrumentKind } from '@equitywise/market-data';
import { getIndex, listIndexKeys } from './indices';
import { getProvider } from './provider';

/**
 * Symbol search over the provider's instrument universe.
 *
 * The universe is large and changes at most daily, so it is fetched once and
 * held in memory. Falling back to the configured index constituents means
 * search still works when the provider is unreachable.
 */

interface Loaded {
  readonly instruments: readonly Instrument[];
  readonly bySymbol: ReadonlyMap<string, Instrument>;
  readonly loadedAt: number;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

const TTL_MS = 12 * 60 * 60_000;

async function load(): Promise<Loaded> {
  if (loaded !== null && Date.now() - loaded.loadedAt < TTL_MS) return loaded;
  if (loading !== null) return loading;

  loading = (async () => {
    const provider = await getProvider();
    const instruments = await provider.listInstruments();
    const result: Loaded = {
      instruments,
      bySymbol: new Map(instruments.map((i: Instrument) => [i.symbol.toUpperCase(), i])),
      loadedAt: Date.now(),
    };
    loaded = result;
    return result;
  })().finally(() => {
    loading = null;
  });

  return loading;
}

/**
 * Starts loading the instrument universe without waiting on it.
 *
 * `resolveSymbol` and `searchSymbols` fall back to this download for any
 * symbol outside `config/indices.yaml` — a full NSE symbol-master CSV (tens
 * of thousands of rows), not a quote. Left lazy, that cost lands on whichever
 * request happens to ask for such a symbol first — for a watchlist stock
 * outside the curated index list, that is a user expanding its row and
 * waiting on the chart. Callers that know a resolution is coming (a
 * watchlist detail load, moments before the user can click a row) fire this
 * first so the cache is already warm, or at least already in flight, by the
 * time `resolveSymbol` actually needs it — `load()`'s own in-flight dedup
 * means a request that arrives before this finishes joins it rather than
 * starting a second download.
 */
export function warmInstrumentCache(): void {
  void load().catch(() => {
    // A failed warm-up is not this call's problem to report — the caller
    // that actually needs the data will hit the same failure and handle it.
  });
}

export interface SearchHit {
  readonly symbol: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly exchange: string;
}

/** Ranks exact and prefix matches above substring matches. */
function score(hit: { symbol: string; name: string }, query: string): number {
  const symbol = hit.symbol.toUpperCase();
  const name = hit.name.toUpperCase();
  if (symbol === query) return 0;
  if (symbol.startsWith(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (symbol.includes(query)) return 3;
  if (name.includes(query)) return 4;
  return 99;
}

export async function searchSymbols(query: string, limit = 12): Promise<SearchHit[]> {
  const q = query.trim().toUpperCase();
  if (q.length < 1) return [];

  let pool: SearchHit[];
  try {
    const { instruments } = await load();
    pool = instruments.map((i) => ({
      symbol: i.symbol,
      name: i.name,
      kind: i.kind,
      exchange: i.exchange,
    }));
  } catch {
    // Provider unreachable — search the configured universe instead of failing.
    pool = await configuredUniverse();
  }

  return pool
    .map((hit) => ({ hit, rank: score(hit, q) }))
    .filter((entry) => entry.rank < 99)
    .sort((a, b) => a.rank - b.rank || a.hit.symbol.length - b.hit.symbol.length)
    .slice(0, limit)
    .map((entry) => entry.hit);
}

async function configuredUniverse(): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const key of await listIndexKeys()) {
    const index = await getIndex(key);
    if (index === null) continue;
    for (const c of index.constituents) {
      if (seen.has(c.symbol)) continue;
      seen.add(c.symbol);
      hits.push({ symbol: c.symbol, name: c.name, kind: 'equity', exchange: 'NSE' });
    }
  }
  return hits;
}

/** A symbol resolved to something the provider can be asked about. */
export interface ResolvedSymbol {
  readonly symbol: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly sector: string;
}

/**
 * Resolves a symbol to a full instrument reference.
 *
 * Prefers the configured indices (which carry curated display names and
 * sectors) and falls back to the provider's universe.
 */
export async function resolveSymbol(symbol: string): Promise<ResolvedSymbol | null> {
  const target = symbol.trim().toUpperCase();

  for (const key of await listIndexKeys()) {
    const index = await getIndex(key);
    if (index === null) continue;
    if (index.ref.symbol.toUpperCase() === target) {
      return { symbol: index.ref.symbol, name: index.name, sector: 'Index', kind: 'index' };
    }
    const match = index.constituents.find((c) => c.symbol.toUpperCase() === target);
    if (match !== undefined) return { ...match, kind: 'equity' };
  }

  try {
    const match = (await load()).bySymbol.get(target);
    if (match !== undefined) {
      return { symbol: match.symbol, name: match.name, sector: 'Other', kind: match.kind };
    }
  } catch {
    // Fall through to null.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

/** One line of a pasted list or a broker export, as the browser parsed it. */
export interface ImportCandidate {
  readonly symbol?: string | undefined;
  readonly isin?: string | undefined;
  readonly name?: string | undefined;
}

export type ImportResolution =
  | {
      readonly status: 'matched';
      readonly symbol: string;
      readonly name: string;
      readonly via: 'symbol' | 'isin' | 'name';
    }
  | {
      readonly status: 'ambiguous';
      readonly candidates: readonly { symbol: string; name: string }[];
    }
  | { readonly status: 'unknown' };

/**
 * Resolves import rows to instruments, one verdict per row, in input order.
 *
 * Three keys are tried in order of how unambiguous they are:
 *
 *   symbol   exact, as everywhere else in the app
 *   isin     exact, from the provider's instrument master — this is what makes
 *            a Groww export work, since Groww writes company names, not tickers
 *   name     normalised exact match first ("Reliance Industries" ≡ "RELIANCE
 *            INDUSTRIES LTD"), then a unique prefix. Two or more prefix hits
 *            are returned as `ambiguous` for the user to pick from, never
 *            guessed: a watchlist that silently gained the wrong "Tata" is
 *            worse than one that asked.
 *
 * Only equities resolve by ISIN or name; an index has neither in any export.
 */
export async function resolveImport(
  candidates: readonly ImportCandidate[],
): Promise<ImportResolution[]> {
  let universe: readonly Instrument[] = [];
  try {
    universe = (await load()).instruments;
  } catch {
    // Symbol resolution still works from the configured universe; ISIN and
    // name lookups will simply come back unknown.
  }
  const byIsin = new Map<string, Instrument>();
  const byName = new Map<string, Instrument>();
  for (const instrument of universe) {
    if (instrument.kind !== 'equity') continue;
    if (instrument.isin !== null && !byIsin.has(instrument.isin))
      byIsin.set(instrument.isin, instrument);
    const key = normaliseName(instrument.name);
    if (key !== '' && !byName.has(key)) byName.set(key, instrument);
  }

  const results: ImportResolution[] = [];
  for (const candidate of candidates) {
    results.push(await resolveOne(candidate, byIsin, byName, universe));
  }
  return results;
}

async function resolveOne(
  candidate: ImportCandidate,
  byIsin: ReadonlyMap<string, Instrument>,
  byName: ReadonlyMap<string, Instrument>,
  universe: readonly Instrument[],
): Promise<ImportResolution> {
  if (candidate.symbol !== undefined && candidate.symbol !== '') {
    const match = await resolveSymbol(candidate.symbol);
    if (match !== null) {
      return { status: 'matched', symbol: match.symbol, name: match.name, via: 'symbol' };
    }
  }

  if (candidate.isin !== undefined && candidate.isin !== '') {
    const match = byIsin.get(candidate.isin.toUpperCase());
    if (match !== undefined) {
      return { status: 'matched', symbol: match.symbol, name: match.name, via: 'isin' };
    }
  }

  if (candidate.name !== undefined && candidate.name.trim() !== '') {
    const key = normaliseName(candidate.name);
    const exact = byName.get(key);
    if (exact !== undefined) {
      return { status: 'matched', symbol: exact.symbol, name: exact.name, via: 'name' };
    }
    if (key.length >= 4) {
      const hits = universe.filter(
        (instrument) =>
          instrument.kind === 'equity' && normaliseName(instrument.name).startsWith(key),
      );
      const [only] = hits;
      if (hits.length === 1 && only !== undefined) {
        return { status: 'matched', symbol: only.symbol, name: only.name, via: 'name' };
      }
      if (hits.length > 1) {
        return {
          status: 'ambiguous',
          candidates: hits.slice(0, 5).map((hit) => ({ symbol: hit.symbol, name: hit.name })),
        };
      }
    }
  }

  return { status: 'unknown' };
}

/**
 * A company name reduced to what identifies it: uppercase, no punctuation,
 * no corporate suffix. "Reliance Industries Ltd." and "RELIANCE INDUSTRIES
 * LIMITED" both become "RELIANCE INDUSTRIES".
 */
export function normaliseName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9& ]+/g, ' ')
    .replace(/\b(LIMITED|LTD|LTD\.|PVT|PRIVATE|CO|COMPANY|CORP|CORPORATION|INC)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
