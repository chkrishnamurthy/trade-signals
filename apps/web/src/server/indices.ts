import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InstrumentRef } from '@signal/market-data';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * Index constituent config, read from `config/indices.yaml`.
 *
 * Adding NIFTY 100 or a watchlist is a change to that file alone — nothing here
 * or in a route handler enumerates index names.
 *
 * Symbols stay in OUR form (`RELIANCE`). Translating to a provider's symbol
 * format happens inside the adapter, never here.
 */

const constituentSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  sector: z.string().min(1).optional(),
});

const indexSchema = z.object({
  name: z.string().min(1),
  indexSymbol: z.string().min(1),
  description: z.string().optional(),
  constituents: z.array(constituentSchema).min(1),
});

const headlineSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().optional(),
});

const configSchema = z.object({
  headlineIndices: z.array(headlineSchema).min(1),
  indices: z.record(z.string(), indexSchema),
});

export type IndexConfig = z.infer<typeof indexSchema>;

export interface ResolvedConstituent extends InstrumentRef {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'equity';
  readonly sector: string;
}

export interface HeadlineIndex extends InstrumentRef {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'index';
  /**
   * How the card renders. A VIX rise is risk-off, not "good", so it must not
   * be coloured green like an index gain.
   */
  readonly display: 'index' | 'volatility';
}

export interface ResolvedIndex {
  readonly key: string;
  readonly name: string;
  readonly ref: InstrumentRef;
  readonly description: string | null;
  readonly constituents: readonly ResolvedConstituent[];
}

/** Repo root, from apps/web at runtime. */
const CONFIG_PATH = join(process.cwd(), '..', '..', 'config', 'indices.yaml');

let cache: Map<string, ResolvedIndex> | null = null;
let headlineCache: HeadlineIndex[] | null = null;

async function loadAll(): Promise<Map<string, ResolvedIndex>> {
  if (cache !== null) return cache;

  const raw = await readFile(CONFIG_PATH, 'utf8');
  const parsed = configSchema.safeParse(parse(raw));
  if (!parsed.success) {
    throw new Error(
      `config/indices.yaml is invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  const resolved = new Map<string, ResolvedIndex>();
  for (const [key, config] of Object.entries(parsed.data.indices)) {
    resolved.set(key.toLowerCase(), {
      key: key.toLowerCase(),
      name: config.name,
      ref: { symbol: config.indexSymbol, kind: 'index' },
      description: config.description ?? null,
      constituents: config.constituents.map((c) => ({
        symbol: c.symbol,
        name: c.name.trim(),
        kind: 'equity' as const,
        sector: c.sector ?? 'Other',
      })),
    });
  }

  cache = resolved;
  headlineCache = parsed.data.headlineIndices.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    kind: 'index' as const,
    display: h.kind === 'volatility' ? ('volatility' as const) : ('index' as const),
  }));
  return resolved;
}

/** Indices shown across the top of the dashboard. */
export async function getHeadlineIndices(): Promise<readonly HeadlineIndex[]> {
  await loadAll();
  return headlineCache ?? [];
}

export async function getIndex(key: string): Promise<ResolvedIndex | null> {
  return (await loadAll()).get(key.toLowerCase()) ?? null;
}

export async function listIndexKeys(): Promise<string[]> {
  return [...(await loadAll()).keys()];
}
