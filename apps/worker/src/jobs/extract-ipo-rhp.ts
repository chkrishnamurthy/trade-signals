import { createHash } from 'node:crypto';
import { extractRhpSections, RHP_EXTRACTOR_VERSION } from '@equitywise/core';
import {
  ipoFeedId,
  listRhpDocumentsToExtract,
  type RhpWorkRow,
  recordRhpFailure,
  saveRhpExtracts,
} from '@equitywise/db';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { type IpoSourcesConfig, loadIpoSourcesConfig, sourceFor } from '../sources/ipo/config.js';
import type { PoliteHttpClient } from '../sources/ipo/http.js';
import { pdfPageTexts, rhpPdfBytes } from '../sources/ipo/rhp-document.js';
import { type IngestCount, withFeedHealth } from './ingest-disclosures.js';
import { clientFor, documentSourceFor } from './ipo/sources.js';

/**
 * Reads sections out of new RHPs (docs/planning/ipos-plan.md Phase 11).
 *
 * At most `rhp.maxDocumentsPerRun` documents a run, newest issues first. A
 * document is fetched only through the client of the official source owning
 * its host (same User-Agent, robots rules, pacing and budget), so the RHP
 * job is exactly as polite as the jobs that found the link. What the
 * extractor can read with confidence is stored with its pages; what it
 * cannot is left out, and the page links the document instead.
 *
 * Attempts are recorded per source as `ipo-<source>-rhp`. A failed document
 * is retried on later runs up to `rhp.maxAttempts`, then left for an operator.
 */

/** Large documents take longer than any page fetch. */
const DOCUMENT_TIMEOUT_MS = 90_000;

export interface RhpJobOptions {
  readonly now?: Date;
  readonly config?: IpoSourcesConfig;
  /** Replaces each source's client (tests). */
  readonly client?: (sourceId: string) => PoliteHttpClient;
  /** Replaces pdf.js (tests). */
  readonly pageTexts?: (pdf: Uint8Array, maxPages: number) => Promise<string[]>;
  /** Documents this run may read (default `rhp.maxDocumentsPerRun`); the catch-up raises it. */
  readonly maxDocuments?: number;
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function extractOne(
  context: WorkerContext,
  doc: RhpWorkRow,
  client: PoliteHttpClient,
  config: IpoSourcesConfig,
  options: RhpJobOptions,
  now: Date,
): Promise<number> {
  const download = await client.getBytes(doc.url, {
    accept: 'application/zip,application/pdf,*/*',
  });
  const pdf = rhpPdfBytes(download, config.rhp.maxBytes);
  const pages = await (options.pageTexts ?? pdfPageTexts)(pdf, config.rhp.maxPages);
  const extracts = extractRhpSections(pages);
  return saveRhpExtracts(context.db, {
    documentId: doc.documentId,
    ipoId: doc.ipoId,
    sha256: createHash('sha256').update(download).digest('hex'),
    sizeBytes: download.byteLength,
    version: RHP_EXTRACTOR_VERSION,
    extractedAt: now,
    extracts: extracts.map((e) => ({
      section: e.section,
      title: e.title,
      body: e.text,
      items: e.items,
      table: e.table,
      pageFrom: e.pageFrom,
      pageTo: e.pageTo,
    })),
  });
}

export async function extractIpoRhp(
  context: WorkerContext,
  log: Logger,
  options: RhpJobOptions = {},
): Promise<IngestCount> {
  const config = options.config ?? (await loadIpoSourcesConfig());
  const now = options.now ?? new Date();
  // Only documents on a host some enabled source owns: the rest are linked,
  // never fetched, and must not crowd readable ones out of the batch.
  const hosts = Object.entries(config.rhp.hosts)
    .filter(([, id]) => sourceFor(config, id, 'rhp') !== null)
    .map(([domain]) => domain);
  const docs = await listRhpDocumentsToExtract(context.db, {
    version: RHP_EXTRACTOR_VERSION,
    maxAttempts: config.rhp.maxAttempts,
    // Over-fetch so one source's share does not cap another's.
    limit: (options.maxDocuments ?? config.rhp.maxDocumentsPerRun) * 5,
    hosts,
    openedSince: config.rhp.since,
  });

  // Every source that may fetch documents gets a run recorded, even an empty
  // one, so a quiet week does not read as a stale feed.
  const bySource = new Map<string, RhpWorkRow[]>();
  for (const id of new Set(Object.values(config.rhp.hosts)))
    if (sourceFor(config, id, 'rhp') !== null) bySource.set(id, []);
  let skipped = 0;
  for (const doc of docs) {
    const id = documentSourceFor(config, doc.url);
    const list = id === null ? undefined : bySource.get(id);
    if (list === undefined) skipped += 1;
    else list.push(doc);
  }
  if (bySource.size === 0) {
    log.info('no source is enabled for RHPs; skipped', { candidates: docs.length });
    return { fetched: 0, written: 0 };
  }

  let budget = options.maxDocuments ?? config.rhp.maxDocumentsPerRun;
  let fetched = 0;
  let written = 0;
  for (const [id, list] of bySource) {
    const batch = list.slice(0, budget);
    budget -= batch.length;
    const client =
      options.client?.(id) ??
      clientFor(config, id, {
        maxBytes: config.rhp.maxBytes,
        timeoutMs: DOCUMENT_TIMEOUT_MS,
        // One download per document plus robots: a catch-up run may need more
        // than the source's everyday budget.
        ...(options.maxDocuments === undefined
          ? {}
          : { maxRequestsPerRun: options.maxDocuments * 2 + 2 }),
      });
    const count = await withFeedHealth(context, ipoFeedId(id, 'rhp'), now, async () => {
      let read = 0;
      let sections = 0;
      let failed = 0;
      for (const doc of batch) {
        try {
          const saved = await extractOne(context, doc, client, config, options, now);
          read += 1;
          sections += saved;
          log.info('rhp read', { source: id, company: doc.companyName, sections: saved });
        } catch (error) {
          failed += 1;
          await recordRhpFailure(context.db, doc.documentId, errorText(error));
          log.warn('rhp not read', {
            source: id,
            company: doc.companyName,
            url: doc.url,
            errorMessage: errorText(error),
          });
        }
      }
      // Every document failing is a feed failure the page should show.
      if (failed > 0 && read === 0)
        throw new Error(`${failed} of ${batch.length} RHP(s) could not be read`);
      return { fetched: read, written: sections };
    });
    fetched += count.fetched;
    written += count.written;
  }
  log.info('rhp extraction done', { documents: fetched, sections: written, skipped });
  return { fetched, written };
}
