import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { type Exchange, listingKey } from '@equitywise/shared';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * The instruments the worker ingests, read from `config/indices.yaml`.
 *
 * The same file the web app reads, so the two can never disagree about what
 * the universe is. Widening coverage is a change to that file alone.
 */

const configSchema = z.object({
  headlineIndices: z.array(
    z.object({
      symbol: z.string().min(1),
      name: z.string().min(1),
      kind: z.string().optional(),
      exchange: z.enum(['NSE', 'BSE']).optional(),
    }),
  ),
  indices: z.record(
    z.string(),
    z.object({
      name: z.string().min(1),
      indexSymbol: z.string().min(1),
      exchange: z.enum(['NSE', 'BSE']).default('NSE'),
      constituents: z.array(
        z.object({
          symbol: z.string().min(1),
          name: z.string().min(1),
          sector: z.string().min(1).optional(),
        }),
      ),
    }),
  ),
});

export interface UniverseEntry {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'equity' | 'index';
  /** The listing's exchange: a BSE index and its constituents are BSE listings. */
  readonly exchange: Exchange;
}

/**
 * Repo root, resolved from this module rather than from `process.cwd()`.
 *
 * The worker is started from `apps/worker` by pnpm but from the repo root by
 * the verification script, and a cwd-relative path silently resolves outside
 * the repo in the second case.
 */
const CONFIG_PATH = fileURLToPath(new URL('../../../config/indices.yaml', import.meta.url));

/**
 * Every distinct instrument across every configured index, deduplicated.
 *
 * A symbol in two indices is one instrument and must be fetched once — paying
 * twice for it would waste a scarce rate-limit budget on a duplicate.
 */
export async function loadUniverse(path = CONFIG_PATH): Promise<UniverseEntry[]> {
  const parsed = configSchema.safeParse(parse(await readFile(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `config/indices.yaml is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  // Keyed by listing key: NSE's RELIANCE and BSE's RELIANCE are two entries.
  const byKey = new Map<string, UniverseEntry>();

  for (const headline of parsed.data.headlineIndices) {
    const entry = {
      symbol: headline.symbol,
      name: headline.name,
      kind: 'index' as const,
      exchange: headline.exchange ?? 'NSE',
    };
    byKey.set(listingKey(entry), entry);
  }

  for (const index of Object.values(parsed.data.indices)) {
    const exchange = index.exchange;
    const indexEntry = {
      symbol: index.indexSymbol,
      name: index.name,
      kind: 'index' as const,
      exchange,
    };
    byKey.set(listingKey(indexEntry), indexEntry);
    for (const constituent of index.constituents) {
      const key = listingKey({ symbol: constituent.symbol, exchange });
      // Indices win over equities on a symbol collision: an index symbol that
      // also appears as a constituent name would otherwise be fetched with the
      // wrong instrument kind and return nothing.
      if (byKey.get(key)?.kind === 'index') continue;
      byKey.set(key, {
        symbol: constituent.symbol,
        name: constituent.name.trim(),
        kind: 'equity',
        exchange,
      });
    }
  }

  return [...byKey.values()];
}

/** A constituent of one index, with the sector used for market context. */
export interface UniverseConstituent {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
  readonly kind: 'equity';
}

/**
 * The constituents of one configured index.
 *
 * The intraday engine works a single, deliberately liquid index rather than
 * the whole universe: an intraday signal on an illiquid name is a pattern that
 * cannot be acted on at anything near the printed price, and every symbol
 * costs a history call against an account-wide per-minute budget.
 */
export async function loadIndexConstituents(
  indexKey: string,
  path = CONFIG_PATH,
): Promise<UniverseConstituent[]> {
  const parsed = configSchema.safeParse(parse(await readFile(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `config/indices.yaml is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const index = parsed.data.indices[indexKey.toLowerCase()];
  if (index === undefined) {
    const available = Object.keys(parsed.data.indices).join(', ');
    throw new Error(`Unknown index "${indexKey}" in config/indices.yaml. Available: ${available}`);
  }

  return index.constituents.map((constituent) => ({
    symbol: constituent.symbol,
    name: constituent.name.trim(),
    sector: constituent.sector ?? 'Other',
    kind: 'equity' as const,
  }));
}
