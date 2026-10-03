import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { IPO_EXCHANGES } from '@equitywise/shared';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * `config/ipo-sources.yaml`, validated (docs/planning/ipos-plan.md §5.4).
 *
 * Cross-field rules are enforced here so a bad edit fails the worker's boot
 * rather than quietly letting aggregator data reach an official field:
 *   - an aggregator may only carry the `gmp` feed;
 *   - an aggregator may never appear in `fieldPriority`;
 *   - the browser User-Agent is allowed for NSE only (owner decision D2).
 */

export const IPO_FEEDS = [
  'calendar',
  'past',
  'detail',
  'subscription',
  'listing',
  'gmp',
  'rhp',
  'filings',
] as const;
export type IpoFeed = (typeof IPO_FEEDS)[number];

const sourceSchema = z
  .object({
    enabled: z.boolean(),
    kind: z.enum(['official_exchange', 'regulator', 'aggregator']),
    exchange: z.enum(IPO_EXCHANGES).optional(),
    userAgent: z.string().min(1),
    minIntervalMs: z.number().int().min(1_000),
    maxRequestsPerRun: z.number().int().min(1).max(2_000),
    timeoutMs: z.number().int().min(1_000).max(120_000).default(20_000),
    feeds: z.array(z.enum(IPO_FEEDS)).min(1),
    attribution: z.object({ name: z.string().min(1), url: z.string().url() }).optional(),
  })
  .strict();

const configSchema = z
  .object({
    userAgents: z.record(z.string().min(1)),
    robotsAgent: z.string().regex(/^[a-z0-9-]+$/i),
    sources: z.record(sourceSchema),
    equitySeries: z
      .object({ mainboard: z.array(z.string().min(1)), sme: z.array(z.string().min(1)) })
      .strict(),
    fieldPriority: z.object({ fallback: z.array(z.string().min(1)) }).strict(),
    documentHosts: z.array(z.string().regex(/^[a-z0-9.-]+$/)).min(1),
    backfill: z
      .object({
        months: z.number().int().min(1).max(240),
        minIntervalMs: z.number().int().min(1_000),
        maxRequests: z.number().int().min(1).max(5_000),
      })
      .strict(),
    rhp: z
      .object({
        /** Document host → the official source whose client fetches from it. */
        hosts: z.record(z.string().min(1)),
        maxDocumentsPerRun: z.number().int().min(1).max(10),
        /**
         * Only issues that opened in the last N days (or have no dates yet):
         * past issues' prospectuses are linked, not downloaded by the hundred.
         */
        recentDays: z.number().int().min(7).max(3_650),
        maxBytes: z
          .number()
          .int()
          .min(1_000_000)
          .max(200 * 1024 * 1024),
        maxPages: z.number().int().min(10).max(5_000),
        maxAttempts: z.number().int().min(1).max(10),
      })
      .strict(),
  })
  .strict()
  .superRefine((config, ctx) => {
    for (const [id, source] of Object.entries(config.sources)) {
      if (config.userAgents[source.userAgent] === undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['sources', id, 'userAgent'],
          message: `unknown user agent "${source.userAgent}"`,
        });
      if (source.userAgent === 'browser' && source.kind === 'aggregator')
        ctx.addIssue({
          code: 'custom',
          path: ['sources', id, 'userAgent'],
          message:
            'an aggregator must identify honestly; the browser User-Agent is for exchanges (D2)',
        });
      if (source.kind === 'aggregator' && source.feeds.some((f) => f !== 'gmp'))
        ctx.addIssue({
          code: 'custom',
          path: ['sources', id, 'feeds'],
          message: 'an aggregator may only carry the gmp feed',
        });
      if (source.kind === 'aggregator' && source.attribution === undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['sources', id, 'attribution'],
          message: 'an aggregator must be attributed',
        });
      if (source.kind !== 'regulator' && source.feeds.includes('filings'))
        ctx.addIssue({
          code: 'custom',
          path: ['sources', id, 'feeds'],
          message: 'filings come from the regulator only',
        });
      if (source.kind === 'aggregator' && source.feeds.includes('rhp'))
        ctx.addIssue({
          code: 'custom',
          path: ['sources', id, 'feeds'],
          message: 'an aggregator never supplies documents',
        });
      if (source.kind !== 'aggregator' && source.feeds.includes('gmp'))
        ctx.addIssue({
          code: 'custom',
          path: ['sources', id, 'feeds'],
          message: 'gmp is unofficial and only an aggregator carries it',
        });
    }
    for (const [host, id] of Object.entries(config.rhp.hosts)) {
      const source = config.sources[id];
      if (source === undefined || source.kind === 'aggregator')
        ctx.addIssue({
          code: 'custom',
          path: ['rhp', 'hosts', host],
          message: `"${id}" is not an official source; documents come from official sources only`,
        });
      if (!config.documentHosts.includes(host))
        ctx.addIssue({
          code: 'custom',
          path: ['rhp', 'hosts', host],
          message: `"${host}" is not in documentHosts`,
        });
    }
    for (const [i, id] of config.fieldPriority.fallback.entries()) {
      const source = config.sources[id];
      if (source === undefined || source.kind === 'aggregator')
        ctx.addIssue({
          code: 'custom',
          path: ['fieldPriority', 'fallback', i],
          message: `"${id}" is not an official source`,
        });
    }
  });

export type IpoSourcesConfig = z.infer<typeof configSchema>;
export type IpoSourceConfig = z.infer<typeof sourceSchema>;

const CONFIG_PATH = fileURLToPath(
  new URL('../../../../../config/ipo-sources.yaml', import.meta.url),
);

export function parseIpoSourcesConfig(raw: unknown): IpoSourcesConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `config/ipo-sources.yaml is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  return parsed.data;
}

export async function loadIpoSourcesConfig(path = CONFIG_PATH): Promise<IpoSourcesConfig> {
  return parseIpoSourcesConfig(parse(await readFile(path, 'utf8')));
}

/** The enabled source carrying `feed`, or null when none does. */
export function sourceFor(
  config: IpoSourcesConfig,
  id: string,
  feed: IpoFeed,
): (IpoSourceConfig & { readonly id: string }) | null {
  const source = config.sources[id];
  if (source === undefined || !source.enabled || !source.feeds.includes(feed)) return null;
  return { ...source, id };
}

/** Series code → board, from `equitySeries`. Null for non-equity series. */
export function boardForSeries(
  config: IpoSourcesConfig,
  series: string,
): 'mainboard' | 'sme' | null {
  const code = series.trim().toUpperCase();
  if (config.equitySeries.mainboard.includes(code)) return 'mainboard';
  if (config.equitySeries.sme.includes(code)) return 'sme';
  return null;
}
