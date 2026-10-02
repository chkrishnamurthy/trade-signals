import 'server-only';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type CalendarConfig, calendarConfigSchema } from '@equitywise/shared';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * The versioned config the IPO pages read (docs/planning/ipos-plan.md §5.4):
 * the exchange calendar (for T+3 dates), registrar allotment links, and which
 * sources exist and how to credit them. Read-only; cached for five minutes so
 * a config edit shows up without a restart.
 */

/** `apps/web` under Next (the app's cwd), or the repo root under tests and scripts. */
function configDir(): string {
  const fromApp = join(process.cwd(), '..', '..', 'config');
  return existsSync(join(fromApp, 'ipo-sources.yaml')) ? fromApp : join(process.cwd(), 'config');
}
const TTL_MS = 5 * 60_000;

const registrarsSchema = z.object({
  registrars: z.array(
    z.object({
      name: z.string(),
      match: z.string(),
      allotmentUrl: z.string().url(),
      checked: z.union([z.string(), z.date()]).nullable(),
    }),
  ),
  exchangeAllotment: z.array(
    z.object({ exchange: z.string(), label: z.string(), url: z.string().url() }),
  ),
});

/** `ipo-rhp-overrides.yaml`: RHP sections hidden by hand, each with its reason. */
const rhpOverridesSchema = z.object({
  overrides: z
    .array(
      z
        .object({
          slug: z.string().min(1),
          section: z.enum(['overview', 'objects', 'promoters', 'financials', 'strengths', 'risks']),
          reason: z.string().min(1),
        })
        .strict(),
    )
    .nullable()
    .transform((v) => v ?? []),
});

/** The slice of `ipo-sources.yaml` the web needs: who a source is and whether it is on. */
const sourcesSchema = z.object({
  sources: z.record(
    z
      .object({
        enabled: z.boolean(),
        kind: z.enum(['official_exchange', 'regulator', 'aggregator']),
        exchange: z.string().optional(),
        attribution: z.object({ name: z.string(), url: z.string().url() }).optional(),
      })
      .passthrough(),
  ),
  rhp: z.object({ maxAttempts: z.number().int().min(1) }).passthrough(),
});

export interface IpoWebConfig {
  readonly calendar: CalendarConfig;
  readonly registrars: readonly {
    readonly name: string;
    readonly pattern: RegExp;
    readonly allotmentUrl: string;
    readonly checked: string | null;
  }[];
  readonly exchangeAllotment: readonly { readonly label: string; readonly url: string }[];
  readonly sources: z.infer<typeof sourcesSchema>['sources'];
  /** Failed reads after which the RHP extractor leaves a document alone. */
  readonly rhpMaxAttempts: number;
  /** `slug` → RHP sections hidden by hand (`ipo-rhp-overrides.yaml`). */
  readonly rhpHidden: ReadonlyMap<string, ReadonlySet<string>>;
}

let cached: { at: number; config: IpoWebConfig } | null = null;

async function yaml(name: string): Promise<unknown> {
  return parse(await readFile(join(configDir(), name), 'utf8'));
}

export async function getIpoWebConfig(now = Date.now()): Promise<IpoWebConfig> {
  if (cached !== null && now - cached.at < TTL_MS) return cached.config;
  const [calendarRaw, registrarsRaw, sourcesRaw, overridesRaw] = await Promise.all([
    yaml('nse-calendar.yaml'),
    yaml('ipo-registrars.yaml'),
    yaml('ipo-sources.yaml'),
    yaml('ipo-rhp-overrides.yaml'),
  ]);
  const calendar = calendarConfigSchema.parse(calendarRaw);
  const registrars = registrarsSchema.parse(registrarsRaw);
  const sources = sourcesSchema.parse(sourcesRaw);
  const rhpHidden = new Map<string, Set<string>>();
  for (const o of rhpOverridesSchema.parse(overridesRaw).overrides) {
    const set = rhpHidden.get(o.slug) ?? new Set<string>();
    set.add(o.section);
    rhpHidden.set(o.slug, set);
  }
  const config: IpoWebConfig = {
    calendar,
    registrars: registrars.registrars.map((r) => ({
      name: r.name,
      pattern: new RegExp(r.match, 'i'),
      allotmentUrl: r.allotmentUrl,
      checked:
        r.checked === null
          ? null
          : r.checked instanceof Date
            ? r.checked.toISOString().slice(0, 10)
            : r.checked,
    })),
    exchangeAllotment: registrars.exchangeAllotment.map(({ label, url }) => ({ label, url })),
    sources: sources.sources,
    rhpMaxAttempts: sources.rhp.maxAttempts,
    rhpHidden,
  };
  cached = { at: now, config };
  return config;
}

/** Display names for source ids. */
const NAMES: Readonly<Record<string, string>> = {
  nse: 'NSE',
  bse: 'BSE',
  sebi: 'SEBI',
  equitywise: 'EquityWise (calculated)',
};

export function sourceName(config: IpoWebConfig, id: string): string {
  return config.sources[id]?.attribution?.name ?? NAMES[id] ?? id;
}

/** The enabled aggregator carrying GMP, if any. */
export function gmpSource(config: IpoWebConfig): { id: string; name: string; url: string } | null {
  for (const [id, source] of Object.entries(config.sources)) {
    if (source.kind === 'aggregator' && source.enabled && source.attribution !== undefined)
      return { id, name: source.attribution.name, url: source.attribution.url };
  }
  return null;
}
