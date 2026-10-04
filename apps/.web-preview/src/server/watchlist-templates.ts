import 'server-only';
import type { WatchlistSummaryDto, WatchlistTemplateDto } from '@/lib/watchlist-types';
import { getIndex, listIndexKeys } from './indices';
import { addSymbols, addWatchlist, getWatchlists } from './watchlists';

/**
 * Starter lists — ready-made watchlists a user can create in one click.
 *
 * Every template is derived from `config/indices.yaml`, which the app already
 * reads for the sector column: each configured index is a template, and each
 * sector across the configured constituents is a template. There is no second
 * source to keep in step, and adding an index to the YAML adds a starter list
 * with nothing else to do.
 *
 * A starter list is a COPY. From the moment it is created it is the user's
 * own — they can remove a name or add one — and an index reshuffle later does
 * not change it under them. A list that tracks an index live is a different
 * feature; this one exists so the first screen is never empty.
 */

/** Sector templates with fewer names than this are noise, not a list. */
const MIN_SECTOR_SIZE = 3;

export async function listTemplates(): Promise<WatchlistTemplateDto[]> {
  const indices: WatchlistTemplateDto[] = [];
  const bySector = new Map<string, Map<string, string>>(); // sector → symbol → name

  for (const key of await listIndexKeys()) {
    const index = await getIndex(key);
    if (index === null) continue;
    indices.push({
      id: `index:${index.key}`,
      kind: 'index',
      name: index.name,
      description: index.description ?? `Constituents of ${index.name}`,
      symbols: index.constituents.map((c) => c.symbol),
    });
    for (const c of index.constituents) {
      if (c.sector === 'Other') continue;
      const members = bySector.get(c.sector) ?? new Map<string, string>();
      if (!members.has(c.symbol)) members.set(c.symbol, c.name);
      bySector.set(c.sector, members);
    }
  }

  const sectors: WatchlistTemplateDto[] = [...bySector.entries()]
    .filter(([, members]) => members.size >= MIN_SECTOR_SIZE)
    .map(([sector, members]) => ({
      id: `sector:${slug(sector)}`,
      kind: 'sector' as const,
      name: sector,
      // Honest about scope: the sector map covers the configured indices, not
      // every listed company in that line of business.
      description: `${members.size} ${sector} names from the configured indices`,
      symbols: [...members.keys()],
    }))
    .sort((a, b) => b.symbols.length - a.symbols.length || a.name.localeCompare(b.name));

  return [...indices, ...sectors];
}

export async function getTemplate(id: string): Promise<WatchlistTemplateDto | null> {
  return (await listTemplates()).find((template) => template.id === id) ?? null;
}

export interface FromTemplateResult {
  readonly watchlist: WatchlistSummaryDto;
  readonly added: number;
  readonly unknown: readonly string[];
}

/**
 * Creates a watchlist from a template and fills it, as one operation.
 *
 * The name defaults to the template's; a clash with a list the user already
 * has gets a numeric suffix rather than a 409, because "NIFTY 50 (2)" is what
 * they meant and a dialog asking them to rename is not.
 */
export async function createFromTemplate(
  templateId: string,
  requestedName?: string,
): Promise<FromTemplateResult | null> {
  const template = await getTemplate(templateId);
  if (template === null) return null;

  const existing = new Set((await getWatchlists()).map((list) => list.name.toLowerCase()));
  const name = uniqueName((requestedName ?? template.name).trim() || template.name, existing);

  const watchlist = await addWatchlist(name);
  const result = await addSymbols(watchlist.id, template.symbols);
  return {
    watchlist: { ...watchlist, count: result.added.length },
    added: result.added.length,
    unknown: result.unknown,
  };
}

export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
