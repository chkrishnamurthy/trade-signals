import 'server-only';
import { type Instrument, listInstruments } from '@signal/fyers';
import { getFyersFetcher } from './fyers-client';
import { getIndex, listIndexKeys, type ResolvedConstituent } from './indices';

/**
 * Symbol search, backed by the Fyers symbol master.
 *
 * The master is a ~1.7 MB CSV on a public CDN — no auth, no rate limit — so it
 * is fetched once and held in memory. Falling back to the configured index
 * constituents means search still works if the CDN is unreachable.
 */

interface Loaded {
  readonly instruments: Instrument[];
  readonly byFyersSymbol: Map<string, Instrument>;
  readonly loadedAt: number;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

const TTL_MS = 12 * 60 * 60_000;

async function load(): Promise<Loaded> {
  if (loaded !== null && Date.now() - loaded.loadedAt < TTL_MS) return loaded;
  if (loading !== null) return loading;

  loading = (async () => {
    const { http } = getFyersFetcher();
    const { instruments } = await listInstruments(http);
    const result: Loaded = {
      instruments,
      byFyersSymbol: new Map(instruments.map((i) => [i.fyersSymbol, i])),
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
  readonly fyersSymbol: string;
  readonly kind: 'equity' | 'index';
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
      fyersSymbol: i.fyersSymbol,
      kind: i.kind,
      exchange: i.exchange,
    }));
  } catch {
    // CDN unreachable — search the configured universe instead of failing.
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
      if (seen.has(c.fyersSymbol)) continue;
      seen.add(c.fyersSymbol);
      hits.push({
        symbol: c.symbol,
        name: c.name,
        fyersSymbol: c.fyersSymbol,
        kind: 'equity',
        exchange: 'NSE',
      });
    }
  }
  return hits;
}

export interface ResolvedSymbol extends ResolvedConstituent {
  readonly kind: 'equity' | 'index';
}

/**
 * Resolves an internal symbol to its Fyers symbol.
 *
 * Prefers the configured indices (which carry curated display names and
 * sectors) and falls back to the symbol master.
 */
export async function resolveSymbol(symbol: string): Promise<ResolvedSymbol | null> {
  const target = symbol.trim().toUpperCase();

  for (const key of await listIndexKeys()) {
    const index = await getIndex(key);
    if (index === null) continue;
    if (index.indexSymbol.toUpperCase() === target) {
      return {
        symbol: index.indexSymbol,
        name: index.name,
        fyersSymbol: index.indexFyersSymbol,
        sector: 'Index',
        kind: 'index',
      };
    }
    const match = index.constituents.find((c) => c.symbol.toUpperCase() === target);
    if (match !== undefined) return { ...match, kind: 'equity' };
  }

  try {
    const { instruments } = await load();
    const match = instruments.find((i) => i.symbol.toUpperCase() === target);
    if (match !== undefined) {
      return {
        symbol: match.symbol,
        name: match.name,
        fyersSymbol: match.fyersSymbol,
        sector: 'Other',
        kind: match.kind,
      };
    }
  } catch {
    // Fall through to null.
  }
  return null;
}
