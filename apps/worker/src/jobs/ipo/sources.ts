import type { FilingSource, GmpSource, IpoSource } from '@equitywise/market-data';
import { istDateKey } from '@equitywise/shared';
import { createBseIpoSource } from '../../sources/ipo/bse.js';
import {
  boardForSeries,
  type IpoFeed,
  type IpoSourcesConfig,
  sourceFor,
} from '../../sources/ipo/config.js';
import { fetchTransport, PoliteHttpClient, type Transport } from '../../sources/ipo/http.js';
import { createInvestorGainSource } from '../../sources/ipo/investorgain.js';
import { lenientHttpsTransport } from '../../sources/ipo/lenient-transport.js';
import { createNseIpoSource } from '../../sources/ipo/nse.js';
import { createSebiFilingSource } from '../../sources/ipo/sebi.js';

/**
 * The IPO composition root: the only place the IPO jobs name a concrete
 * source. A job asks for "every enabled official source carrying this feed"
 * and gets a fresh polite client per source, so each run has its own budget.
 */

export interface BuiltSource {
  readonly id: string;
  readonly source: IpoSource;
  readonly client: PoliteHttpClient;
}

export interface SourceOverrides {
  /** Injected in tests; the real fetch transport otherwise. */
  readonly transport?: Transport;
  /** A paced backfill raises the per-run budget and slows the interval. */
  readonly maxRequestsPerRun?: number;
  readonly minIntervalMs?: number;
  /** Raises the response cap and timeout (an RHP bundle is larger than any page). */
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
}

/** Builders for every official source this codebase knows how to read. */
const OFFICIAL: Readonly<
  Record<string, (client: PoliteHttpClient, config: IpoSourcesConfig) => IpoSource>
> = {
  nse: (client, config) =>
    createNseIpoSource({
      client,
      boardOf: (series) => boardForSeries(config, series),
      documentHosts: config.documentHosts,
    }),
  bse: (client, config) =>
    createBseIpoSource({
      client,
      documentHosts: config.documentHosts,
      today: () => istDateKey(new Date()),
    }),
};

/**
 * Transports a source needs by default. BSE's servers send header lines that
 * `fetch` rejects, so BSE goes through the lenient `node:https` parser.
 */
const DEFAULT_TRANSPORT: Readonly<Record<string, (maxBytes?: number) => Transport>> = {
  bse: (maxBytes) => lenientHttpsTransport(maxBytes),
};

function transportFor(id: string, overrides: SourceOverrides): Transport | undefined {
  if (overrides.transport !== undefined) return overrides.transport;
  const builder = DEFAULT_TRANSPORT[id];
  if (builder !== undefined) return builder(overrides.maxBytes);
  return overrides.maxBytes === undefined ? undefined : fetchTransport(overrides.maxBytes);
}

export function clientFor(
  config: IpoSourcesConfig,
  id: string,
  overrides: SourceOverrides = {},
): PoliteHttpClient {
  const source = config.sources[id];
  if (source === undefined) throw new Error(`unknown IPO source "${id}"`);
  const transport = transportFor(id, overrides);
  return new PoliteHttpClient({
    sourceId: id,
    userAgent: config.userAgents[source.userAgent] ?? '',
    robotsAgent: config.robotsAgent,
    minIntervalMs: Math.max(source.minIntervalMs, overrides.minIntervalMs ?? 0),
    maxRequestsPerRun: overrides.maxRequestsPerRun ?? source.maxRequestsPerRun,
    timeoutMs: Math.max(source.timeoutMs, overrides.timeoutMs ?? 0),
    ...(transport === undefined ? {} : { transport }),
  });
}

/** Every enabled official source that carries `feed`, ready to use. */
export function officialSources(
  config: IpoSourcesConfig,
  feed: IpoFeed,
  overrides: SourceOverrides = {},
  builders: Readonly<
    Record<string, (client: PoliteHttpClient, config: IpoSourcesConfig) => IpoSource>
  > = OFFICIAL,
): BuiltSource[] {
  const out: BuiltSource[] = [];
  for (const id of Object.keys(config.sources)) {
    const enabled = sourceFor(config, id, feed);
    const build = builders[id];
    if (enabled === null || enabled.kind === 'aggregator' || build === undefined) continue;
    const client = clientFor(config, id, overrides);
    out.push({ id, source: build(client, config), client });
  }
  return out;
}

export interface BuiltGmpSource {
  readonly id: string;
  readonly source: GmpSource;
  readonly client: PoliteHttpClient;
}

/** Builders for the unofficial GMP sources. Aggregators only — never an exchange. */
const GMP: Readonly<Record<string, (client: PoliteHttpClient) => GmpSource>> = {
  investorgain: (client) => createInvestorGainSource(client),
};

/** Every enabled aggregator carrying the `gmp` feed (owner decision D1). */
export function gmpSources(
  config: IpoSourcesConfig,
  overrides: SourceOverrides = {},
): BuiltGmpSource[] {
  const out: BuiltGmpSource[] = [];
  for (const id of Object.keys(config.sources)) {
    const enabled = sourceFor(config, id, 'gmp');
    const build = GMP[id];
    if (enabled === null || enabled.kind !== 'aggregator' || build === undefined) continue;
    const client = clientFor(config, id, overrides);
    out.push({ id, source: build(client), client });
  }
  return out;
}

export interface BuiltFilingSource {
  readonly id: string;
  readonly source: FilingSource;
  readonly client: PoliteHttpClient;
}

/** Builders for the regulator's filing lists. */
const FILINGS: Readonly<Record<string, (client: PoliteHttpClient) => FilingSource>> = {
  sebi: (client) => createSebiFilingSource(client),
};

/** Every enabled regulator source carrying the `filings` feed. */
export function filingSources(
  config: IpoSourcesConfig,
  overrides: SourceOverrides = {},
): BuiltFilingSource[] {
  const out: BuiltFilingSource[] = [];
  for (const id of Object.keys(config.sources)) {
    const enabled = sourceFor(config, id, 'filings');
    const build = FILINGS[id];
    if (enabled === null || enabled.kind !== 'regulator' || build === undefined) continue;
    const client = clientFor(config, id, overrides);
    out.push({ id, source: build(client), client });
  }
  return out;
}

/**
 * The official source that may fetch `url` for the RHP extractor: the one
 * `rhp.hosts` maps the link's host (or parent domain) to, when it is enabled
 * with the `rhp` feed. Null means the document is linked, never fetched.
 */
export function documentSourceFor(config: IpoSourcesConfig, url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [domain, id] of Object.entries(config.rhp.hosts)) {
    if (host !== domain && !host.endsWith(`.${domain}`)) continue;
    const source = sourceFor(config, id, 'rhp');
    return source === null || source.kind === 'aggregator' ? null : id;
  }
  return null;
}
