import 'server-only';
import type { Instrument, InstrumentKind } from '@wealthos/market-data';
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
