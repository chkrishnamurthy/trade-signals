import 'server-only';
import {
  type Exchange,
  type Instrument,
  type InstrumentKind,
  listingKey,
  parseListingKey,
} from '@equitywise/market-data';
import { getIndex, listIndexKeys } from './indices';
import { getProvider } from './provider';

/**
 * Symbol search over the provider's instrument universe.
 *
 * The universe is large and changes at most daily, so it is fetched once and
 * held in memory. Falling back to the configured index constituents means
 * search still works when the provider is unreachable.
 *
 * The universe spans NSE and BSE. A company listed on both is ONE search
 * result under its primary listing — NSE when it has one, BSE otherwise
 * (multi-exchange plan, D1) — carrying the exchanges it trades on. A bare
 * symbol resolves the same way; `BSE:RELIANCE` names the BSE listing
 * explicitly.
 */

interface Loaded {
  readonly instruments: readonly Instrument[];
  /** By upper-cased listing key: `RELIANCE`, `BSE:RELIANCE`. */
  readonly byKey: ReadonlyMap<string, Instrument>;
  /** Exchanges each ISIN is listed on, primary first. */
  readonly listingsByIsin: ReadonlyMap<string, readonly Exchange[]>;
  readonly loadedAt: number;
}

/** NSE before BSE: the order that decides a company's primary listing. */
const EXCHANGE_RANK: Readonly<Record<Exchange, number>> = { NSE: 0, BSE: 1 };

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

const TTL_MS = 12 * 60 * 60_000;

async function load(): Promise<Loaded> {
  if (loaded !== null && Date.now() - loaded.loadedAt < TTL_MS) return loaded;
  if (loading !== null) return loading;

  loading = (async () => {
    const provider = await getProvider();
    // Primary listings first, so every first-wins lookup below prefers NSE.
    const instruments = [...(await provider.listInstruments())].sort(
      (a, b) => EXCHANGE_RANK[a.exchange] - EXCHANGE_RANK[b.exchange],
    );
    const byKey = new Map<string, Instrument>();
    const listingsByIsin = new Map<string, Exchange[]>();
    for (const i of instruments) {
      const key = listingKey(i).toUpperCase();
      if (!byKey.has(key)) byKey.set(key, i);
      if (i.isin === null) continue;
      const listings = listingsByIsin.get(i.isin) ?? [];
      if (!listings.includes(i.exchange)) listings.push(i.exchange);
      listingsByIsin.set(i.isin, listings);
    }
    const result: Loaded = { instruments, byKey, listingsByIsin, loadedAt: Date.now() };
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
  /** Our symbol, for display: `RELIANCE`. */
  readonly symbol: string;
  /**
   * The listing key, for everything that names the listing — adding it to a
   * watchlist, opening its chart: `RELIANCE` (NSE) or `BSE:7SEASL`.
   */
  readonly key: string;
  readonly name: string;
  readonly kind: InstrumentKind;
  /** The primary listing's exchange. */
  readonly exchange: string;
  /** Every exchange the company trades on, primary first. */
  readonly listings: readonly string[];
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

  // An explicit `BSE:` query searches that exchange's listings only.
  const qualified = parseListingKey(q);
  const onlyExchange = q.includes(':') ? qualified.exchange : null;
  const text = onlyExchange === null ? q : qualified.symbol;
  if (text.length < 1) return [];

  let pool: SearchHit[];
  try {
    const { instruments, listingsByIsin } = await load();
    pool = [];
    for (const i of instruments) {
      const listings =
        i.isin === null ? [i.exchange] : (listingsByIsin.get(i.isin) ?? [i.exchange]);
      if (onlyExchange !== null) {
        if (i.exchange !== onlyExchange) continue;
      } else if (listings[0] !== i.exchange) {
        // One result per company: its secondary listing is a badge, not a row.
        continue;
      }
      pool.push({
        symbol: i.symbol,
        key: listingKey(i),
        name: i.name,
        kind: i.kind,
        exchange: i.exchange,
        listings,
      });
    }
  } catch {
    // Provider unreachable — search the configured universe instead of failing.
    pool = await configuredUniverse();
  }

  return pool
    .map((hit) => ({ hit, rank: score(hit, text) }))
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
      hits.push({
        symbol: c.symbol,
        key: c.symbol,
        name: c.name,
        kind: 'equity',
        exchange: 'NSE',
        listings: ['NSE'],
      });
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
  readonly exchange: Exchange;
}

/**
 * Resolves a symbol or listing key to a full instrument reference.
 *
 * `BSE:RELIANCE` names that listing exactly. A bare `RELIANCE` names the
 * company's primary listing: NSE when it has one, BSE otherwise — so a
 * BSE-only name still resolves when typed bare.
 *
 * Prefers the configured indices (which carry curated display names and
 * sectors) and falls back to the provider's universe.
 */
export async function resolveSymbol(symbol: string): Promise<ResolvedSymbol | null> {
  const raw = symbol.trim().toUpperCase();
  const explicit = raw.includes(':');
  const { symbol: target, exchange } = parseListingKey(raw);

  for (const key of await listIndexKeys()) {
    const index = await getIndex(key);
    if (index === null) continue;
    const indexExchange = index.ref.exchange ?? 'NSE';
    if (index.ref.symbol.toUpperCase() === target && indexExchange === exchange) {
      return {
        symbol: index.ref.symbol,
        name: index.name,
        sector: 'Index',
        kind: 'index',
        exchange: indexExchange,
      };
    }
    const match = index.constituents.find(
      (c) => c.symbol.toUpperCase() === target && (c.exchange ?? 'NSE') === exchange,
    );
    if (match !== undefined) return { ...match, kind: 'equity' };
  }

  try {
    const { byKey } = await load();
    const match =
      byKey.get(listingKey({ symbol: target, exchange })) ??
      // Bare and not on NSE: the BSE listing is the primary one.
      (explicit ? undefined : byKey.get(listingKey({ symbol: target, exchange: 'BSE' })));
    if (match !== undefined) {
      return {
        symbol: match.symbol,
        name: match.name,
        sector: 'Other',
        kind: match.kind,
        exchange: match.exchange,
      };
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
    // Primary listings only: a company on both exchanges is one candidate,
    // never an "ambiguous" pair of itself.
    const { instruments, listingsByIsin } = await load();
    universe = instruments.filter(
      (i) => i.isin === null || (listingsByIsin.get(i.isin)?.[0] ?? i.exchange) === i.exchange,
    );
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
      return { status: 'matched', symbol: listingKey(match), name: match.name, via: 'symbol' };
    }
  }

  if (candidate.isin !== undefined && candidate.isin !== '') {
    const match = byIsin.get(candidate.isin.toUpperCase());
    if (match !== undefined) {
      return { status: 'matched', symbol: listingKey(match), name: match.name, via: 'isin' };
    }
  }

  if (candidate.name !== undefined && candidate.name.trim() !== '') {
    const key = normaliseName(candidate.name);
    const exact = byName.get(key);
    if (exact !== undefined) {
      return { status: 'matched', symbol: listingKey(exact), name: exact.name, via: 'name' };
    }
    if (key.length >= 4) {
      const hits = universe.filter(
        (instrument) =>
          instrument.kind === 'equity' && normaliseName(instrument.name).startsWith(key),
      );
      const [only] = hits;
      if (hits.length === 1 && only !== undefined) {
        return { status: 'matched', symbol: listingKey(only), name: only.name, via: 'name' };
      }
      if (hits.length > 1) {
        return {
          status: 'ambiguous',
          candidates: hits.slice(0, 5).map((hit) => ({ symbol: listingKey(hit), name: hit.name })),
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
