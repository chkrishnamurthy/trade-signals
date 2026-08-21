import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toFyersSymbol } from '@signal/fyers';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * Index constituent config, read from `config/indices.yaml`.
 *
 * Adding NIFTY 100 or a watchlist is a change to that file alone — nothing here
 * or in the route handler enumerates index names.
 */

const constituentSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
});

const indexSchema = z.object({
  name: z.string().min(1),
  indexSymbol: z.string().min(1),
  description: z.string().optional(),
  constituents: z.array(constituentSchema).min(1),
});

const configSchema = z.object({
  indices: z.record(z.string(), indexSchema),
});

export type IndexConfig = z.infer<typeof indexSchema>;

export interface ResolvedConstituent {
  readonly symbol: string;
  readonly name: string;
  readonly fyersSymbol: string;
}

export interface ResolvedIndex {
  readonly key: string;
  readonly name: string;
  readonly indexSymbol: string;
  readonly indexFyersSymbol: string;
  readonly description: string | null;
  readonly constituents: readonly ResolvedConstituent[];
}

/** Repo root, from apps/web at runtime. */
const CONFIG_PATH = join(process.cwd(), '..', '..', 'config', 'indices.yaml');

let cache: Map<string, ResolvedIndex> | null = null;

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
      indexSymbol: config.indexSymbol,
      indexFyersSymbol: toFyersSymbol(config.indexSymbol, 'index'),
      description: config.description ?? null,
      constituents: config.constituents.map((c) => ({
        symbol: c.symbol,
        name: c.name,
        // The one place a bare symbol becomes a Fyers symbol.
        fyersSymbol: toFyersSymbol(c.symbol, 'equity'),
      })),
    });
  }

  cache = resolved;
  return resolved;
}

export async function getIndex(key: string): Promise<ResolvedIndex | null> {
  return (await loadAll()).get(key.toLowerCase()) ?? null;
}

export async function listIndexKeys(): Promise<string[]> {
  return [...(await loadAll()).keys()];
}
