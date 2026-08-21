import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
    z.object({ symbol: z.string().min(1), name: z.string().min(1), kind: z.string().optional() }),
  ),
  indices: z.record(
    z.string(),
    z.object({
      name: z.string().min(1),
      indexSymbol: z.string().min(1),
      constituents: z.array(z.object({ symbol: z.string().min(1), name: z.string().min(1) })),
    }),
  ),
});

export interface UniverseEntry {
  readonly symbol: string;
  readonly name: string;
  readonly kind: 'equity' | 'index';
}

const CONFIG_PATH = join(process.cwd(), '..', '..', 'config', 'indices.yaml');

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

  const bySymbol = new Map<string, UniverseEntry>();

  for (const headline of parsed.data.headlineIndices) {
    bySymbol.set(headline.symbol, {
      symbol: headline.symbol,
      name: headline.name,
      kind: 'index',
    });
  }

  for (const index of Object.values(parsed.data.indices)) {
    bySymbol.set(index.indexSymbol, {
      symbol: index.indexSymbol,
      name: index.name,
      kind: 'index',
    });
    for (const constituent of index.constituents) {
      // Indices win over equities on a symbol collision: an index symbol that
      // also appears as a constituent name would otherwise be fetched with the
      // wrong instrument kind and return nothing.
      if (bySymbol.get(constituent.symbol)?.kind === 'index') continue;
      bySymbol.set(constituent.symbol, {
        symbol: constituent.symbol,
        name: constituent.name.trim(),
        kind: 'equity',
      });
    }
  }

  return [...bySymbol.values()];
}
