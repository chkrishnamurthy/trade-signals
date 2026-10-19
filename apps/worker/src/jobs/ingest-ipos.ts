import {
  type IssueCandidate,
  type MatchResult,
  matchFiling,
  matchGmpRow,
  matchIssue,
  matchListing,
} from '@equitywise/core';
import {
  attachSourceKey,
  createIpoIssue,
  type Database,
  type IpoIdentityRow,
  type IpoWorkRow,
  insertGmpSnapshots,
  insertSubscriptionSnapshot,
  ipoFeedId,
  issuesWithListingDay,
  issuesWithSubscription,
  linkSebiFiling,
  listIssueIdentities,
  listIssuesForDetail,
  listIssuesListedSince,
  listIssuesOpenedSince,
  listOpenIssues,
  listRecentlyClosedIssues,
  listUnlinkedSebiFilings,
  recordListingDay,
  recordSourceObservation,
  sourceKeysFor,
  updateLatestClose,
  upsertIpoDocuments,
  upsertSebiFilings,
} from '@equitywise/db';
import type {
  IpoKey,
  IpoSource,
  RawIpoListing,
  RawIpoSubscription,
  RawListingDay,
} from '@equitywise/market-data';
import { type IpoExchange, istDateKey } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { type IpoSourcesConfig, loadIpoSourcesConfig } from '../sources/ipo/config.js';
import type { Transport } from '../sources/ipo/http.js';
import { type IngestCount, withFeedHealth } from './ingest-disclosures.js';
import { resolveIssue } from './ipo/resolve-issue.js';
import {
  type BuiltFilingSource,
  type BuiltGmpSource,
  type BuiltSource,
  filingSources,
  gmpSources,
  officialSources,
} from './ipo/sources.js';

/**
 * IPO ingestion (docs/planning/ipos-plan.md §8).
 *
 * Every job reads `config/ipo-sources.yaml`, asks each enabled official source
 * for its part, records each answer as an observation (`ipo_source_records`),
 * and re-resolves the touched issues. Each source's attempt is recorded in
 * `feed_ingestion_runs` as `ipo-<source>-<feed>`, so `/ipos` can say which
 * dataset is stale and why. One bad issue never fails a run; an unreadable
 * envelope always does.
 *
 * These jobs never touch the market-data provider or a credential.
 */

export interface IpoJobOptions {
  readonly now?: Date;
  readonly config?: IpoSourcesConfig;
  readonly transport?: Transport;
  /** Replaces the real source builders (tests). */
  readonly sources?: (feed: string) => BuiltSource[];
  /** Replaces the real GMP source builders (tests). */
  readonly gmp?: () => BuiltGmpSource[];
  /** Replaces the real filing source builders (tests). */
  readonly filings?: () => BuiltFilingSource[];
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

async function setup(options: IpoJobOptions, feed: Parameters<typeof officialSources>[1]) {
  const config = options.config ?? (await loadIpoSourcesConfig());
  const now = options.now ?? new Date();
  const sources =
    options.sources?.(feed) ??
    officialSources(
      config,
      feed,
      options.transport === undefined ? {} : { transport: options.transport },
    );
  return { config, now, today: istDateKey(now), sources };
}

function errorFields(error: unknown): Record<string, string> {
  return error instanceof Error
    ? { errorName: error.name, errorMessage: error.message }
    : { errorMessage: String(error) };
}

// ---------------------------------------------------------------------------
// Observing a listing: match, create, record
// ---------------------------------------------------------------------------

function slugYear(listing: RawIpoListing, now: Date): number {
  const year = Number((listing.openDate ?? listing.closeDate ?? '').slice(0, 4));
  return Number.isInteger(year) && year > 1990 ? year : Number(istDateKey(now).slice(0, 4));
}

/**
 * Matches a listing to a known issue (creating one when nothing matches) and
 * records the observation. A probable-only match is recorded unattached and
 * left for the operator — never merged on a guess. Returns the issue id.
 */
/** What a listing says about its issue's identity, in the matcher's terms. */
function candidateFor(listing: RawIpoListing): IssueCandidate {
  return {
    companyName: listing.companyName,
    board: listing.board,
    isin: listing.isin,
    nseSymbol: listing.exchange === 'NSE' ? listing.symbol : null,
    bseScripCode:
      listing.exchange === 'BSE' ? (listing.bseScripCode ?? listing.symbol) : listing.bseScripCode,
    openDate: listing.openDate,
    closeDate: listing.closeDate,
  };
}

export async function observeListing(
  db: Database,
  listing: RawIpoListing,
  feed: 'calendar' | 'past',
  identities: IpoIdentityRow[],
  now: Date,
  log: Logger,
  /** A match the caller already made against these same identities. */
  known?: MatchResult,
): Promise<number | null> {
  const candidate = candidateFor(listing);
  const match = known ?? matchIssue(candidate, identities);
  let ipoId: number | null = null;
  if (match.kind === 'probable') {
    log.warn('ipo listing only probably matches; held for review', {
      source: listing.source,
      key: listing.externalKey,
      candidates: match.ids,
    });
  } else if (match.kind === 'none') {
    ipoId = await createIpoIssue(db, {
      companyName: listing.companyName,
      board: listing.board,
      openDate: listing.openDate,
      nseSymbol: candidate.nseSymbol,
      nseSeries: listing.exchange === 'NSE' ? listing.series : null,
      bseScripCode: candidate.bseScripCode,
      isin: listing.isin,
      slugYear: slugYear(listing, now),
    });
    identities.push({ id: ipoId, slug: '', ...candidate });
  } else {
    ipoId = match.id;
  }
  await recordSourceObservation(db, {
    ipoId,
    source: listing.source,
    feed,
    externalKey: listing.externalKey,
    sourceUrl: listing.sourceUrl,
    payload: { ...listing },
    seenAt: now,
  });
  if (ipoId !== null)
    await attachSourceKey(db, { source: listing.source, externalKey: listing.externalKey }, ipoId);
  return ipoId;
}

/**
 * The key each issue has at one source. NSE keys derive from the symbol; BSE's
 * detail needs its own `IPO_NO`, read from the BSE calendar observation.
 */
async function keysFor(
  db: Database,
  sourceId: string,
  issues: readonly IpoWorkRow[],
): Promise<Map<number, IpoKey>> {
  const out = new Map<number, IpoKey>();
  if (sourceId === 'nse') {
    for (const issue of issues) {
      if (issue.nseSymbol === null) continue;
      const series = issue.nseSeries ?? (issue.board === 'sme' ? 'SME' : 'EQ');
      out.set(issue.id, {
        source: 'nse',
        symbol: issue.nseSymbol,
        series,
        externalKey: `nse:${issue.nseSymbol}:${series}:${issue.openDate ?? 'tba'}`,
      });
    }
    return out;
  }
  const keys = await sourceKeysFor(
    db,
    sourceId,
    'calendar',
    issues.map((i) => i.id),
  );
  for (const issue of issues) {
    const externalKey = keys.get(issue.id);
    if (externalKey === undefined) continue;
    const symbol = externalKey.slice(externalKey.indexOf(':') + 1);
    out.set(issue.id, {
      source: sourceId,
      symbol,
      series: issue.board === 'sme' ? 'SME' : 'MainBoard',
      externalKey,
    });
  }
  return out;
}

/** Records an issue's detail page and its documents and NSE-only bids. Returns rows written. */
async function observeDetail(
  db: Database,
  source: IpoSource,
  issue: IpoWorkRow,
  key: IpoKey,
  config: IpoSourcesConfig,
  now: Date,
): Promise<number> {
  const detail = await source.fetchDetail(key);
  if (detail === null) return 0;
  const { subscription, documents, ...facts } = detail;
  let written = 0;
  const { changed } = await recordSourceObservation(db, {
    ipoId: issue.id,
    source: detail.source,
    feed: 'detail',
    externalKey: key.externalKey,
    sourceUrl: detail.sourceUrl,
    payload: { ...facts },
    seenAt: now,
  });
  if (changed) written += 1;
  written += await upsertIpoDocuments(db, issue.id, detail.source, documents, now);
  if (subscription !== null) written += await recordSubscription(db, issue.id, subscription, now);
  await resolveIssue(db, issue.id, config, now);
  return written;
}

async function recordSubscription(
  db: Database,
  ipoId: number,
  subscription: RawIpoSubscription,
  now: Date,
): Promise<number> {
  return insertSubscriptionSnapshot(db, {
    ipoId,
    source: subscription.source,
    scope: subscription.scope,
    asOf: subscription.asOf ?? now,
    asOfBasis: subscription.asOf === null ? 'fetched' : 'stated',
    rows: subscription.rows,
  });
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * Calendar + past issues → issues. New active issues get their detail in the
 * same run, so a page never shows an issue without its lot and registrar for
 * long. Past rows are taken only inside the backfill window (or when already known).
 */
export async function ingestIpoCalendar(
  context: WorkerContext,
  log: Logger,
  options: IpoJobOptions = {},
): Promise<IngestCount> {
  const { config, now, today, sources } = await setup(options, 'calendar');
  if (sources.length === 0) {
    log.info('no enabled source carries the ipo calendar; skipped');
    return { fetched: 0, written: 0 };
  }
  // Past issues from the configured first day of history (`backfill.since`).
  const windowStart = config.backfill.since;
  let fetched = 0;
  let written = 0;
  for (const { id, source } of sources) {
    const count = await withFeedHealth(context, ipoFeedId(id, 'calendar'), now, async () => {
      const identities = await listIssueIdentities(context.db);
      const known = new Set(identities.map((i) => i.id));
      const touched = new Set<number>();
      const fresh: number[] = [];
      const listings = await source.fetchCalendar();
      for (const listing of listings) {
        const ipoId = await observeListing(context.db, listing, 'calendar', identities, now, log);
        if (ipoId === null) continue;
        touched.add(ipoId);
        if (!known.has(ipoId)) fresh.push(ipoId);
      }
      let pastCount = 0;
      if (config.sources[id]?.feeds.includes('past')) {
        const past = await source.fetchPastIssues();
        pastCount = past.length;
        for (const listing of past) {
          const inWindow = (listing.openDate ?? listing.closeDate ?? '') >= windowStart;
          // Matched once and handed on: `observeListing` would otherwise repeat it.
          const already = matchIssue(candidateFor(listing), identities);
          if (!inWindow && already.kind !== 'nse_symbol' && already.kind !== 'isin') continue;
          const ipoId = await observeListing(
            context.db,
            listing,
            'past',
            identities,
            now,
            log,
            already,
          );
          if (ipoId !== null) touched.add(ipoId);
        }
      }
      for (const ipoId of touched) await resolveIssue(context.db, ipoId, config, now);

      // Detail for issues first seen this run, in the same run.
      let detailed = 0;
      const work = (await listIssuesForDetail(context.db, today, 7)).filter((i) =>
        fresh.includes(i.id),
      );
      const keys = await keysFor(context.db, id, work);
      for (const issue of work) {
        const key = keys.get(issue.id) ?? null;
        if (key === null) continue;
        try {
          detailed += await observeDetail(context.db, source, issue, key, config, now);
        } catch (error) {
          log.warn('ipo detail failed for a new issue; the details job will retry', {
            issue: issue.id,
            ...errorFields(error),
          });
        }
      }
      log.info('ipo calendar ingested', {
        source: id,
        listings: listings.length,
        past: pastCount,
        issues: touched.size,
        created: fresh.length,
        detailed,
      });
      return { fetched: listings.length + pastCount, written: touched.size };
    });
    fetched += count.fetched;
    written += count.written;
  }
  return { fetched, written };
}

/** Detail pages for every issue still moving (not listed, or listed within a week). */
export async function ingestIpoDetails(
  context: WorkerContext,
  log: Logger,
  options: IpoJobOptions = {},
): Promise<IngestCount> {
  const { config, now, today, sources } = await setup(options, 'detail');
  let fetched = 0;
  let written = 0;
  for (const { id, source } of sources) {
    const count = await withFeedHealth(context, ipoFeedId(id, 'detail'), now, async () => {
      const issues = await listIssuesForDetail(context.db, today, 7);
      const keys = await keysFor(context.db, id, issues);
      let ok = 0;
      let failed = 0;
      let rows = 0;
      for (const issue of issues) {
        const key = keys.get(issue.id) ?? null;
        if (key === null) continue;
        try {
          rows += await observeDetail(context.db, source, issue, key, config, now);
          ok += 1;
        } catch (error) {
          failed += 1;
          log.warn('ipo detail failed', {
            issue: issue.id,
            symbol: key.symbol,
            ...errorFields(error),
          });
        }
      }
      if (ok === 0 && failed > 0) throw new Error(`every ipo detail request failed (${failed})`);
      log.info('ipo details ingested', { source: id, issues: ok, failed, written: rows });
      return { fetched: ok, written: rows };
    });
    fetched += count.fetched;
    written += count.written;
  }
  return { fetched, written };
}

/**
 * The broadest-scope subscription figure for every open issue, and for issues
 * closed in the last day (the final figure settles after the close).
 */
export async function ingestIpoSubscriptions(
  context: WorkerContext,
  log: Logger,
  options: IpoJobOptions = {},
): Promise<IngestCount> {
  const { now, today, sources } = await setup(options, 'subscription');
  let fetched = 0;
  let written = 0;
  for (const { id, source } of sources) {
    const count = await withFeedHealth(context, ipoFeedId(id, 'subscription'), now, async () => {
      const issues = [
        ...(await listOpenIssues(context.db, today)),
        ...(await listRecentlyClosedIssues(context.db, today, 1)),
      ];
      const keys = await keysFor(context.db, id, issues);
      let ok = 0;
      let failed = 0;
      let rows = 0;
      for (const issue of issues) {
        const key = keys.get(issue.id) ?? null;
        if (key === null) continue;
        try {
          const subscription = await source.fetchSubscription(key);
          ok += 1;
          if (subscription !== null)
            rows += await recordSubscription(context.db, issue.id, subscription, now);
        } catch (error) {
          failed += 1;
          log.warn('ipo subscription failed', { issue: issue.id, ...errorFields(error) });
        }
      }
      if (ok === 0 && failed > 0)
        throw new Error(`every ipo subscription request failed (${failed})`);
      log.info('ipo subscriptions ingested', { source: id, issues: ok, failed, written: rows });
      return { fetched: ok, written: rows };
    });
    fetched += count.fetched;
    written += count.written;
  }
  return { fetched, written };
}

/**
 * Whether an end-of-day row really is this issue's debut. NSE writes the issue
 * price as the listing day's "previous close", so it must equal the official
 * final price — or, before that is known, lie inside the band. BSE writes 0
 * there (null here), so a BSE row needs the official issue price instead. A
 * mismatch means a reused symbol or a relisting, and nothing is written.
 */
export function listingDayCheck(
  row: Pick<RawListingDay, 'prevClosePaise'>,
  issue: Pick<IpoWorkRow, 'issuePricePaise' | 'priceBandLowPaise' | 'priceBandHighPaise'>,
): { ok: true; issuePricePaise: number } | { ok: false; reason: string } {
  if (row.prevClosePaise === null)
    return issue.issuePricePaise === null
      ? { ok: false, reason: 'no previous close in the file and no official issue price yet' }
      : { ok: true, issuePricePaise: issue.issuePricePaise };
  if (issue.issuePricePaise !== null)
    return row.prevClosePaise === issue.issuePricePaise
      ? { ok: true, issuePricePaise: row.prevClosePaise }
      : {
          ok: false,
          reason: `previous close ${row.prevClosePaise} ≠ issue price ${issue.issuePricePaise}`,
        };
  if (issue.priceBandLowPaise !== null && issue.priceBandHighPaise !== null)
    return row.prevClosePaise >= issue.priceBandLowPaise &&
      row.prevClosePaise <= issue.priceBandHighPaise
      ? { ok: true, issuePricePaise: row.prevClosePaise }
      : { ok: false, reason: `previous close ${row.prevClosePaise} outside the band` };
  return { ok: true, issuePricePaise: row.prevClosePaise };
}

/** The end-of-day row that is this issue's: NSE by symbol, BSE by ISIN. */
function rowFor(
  rows: readonly RawListingDay[],
  issue: Pick<IpoWorkRow, 'nseSymbol' | 'isin'>,
  exchange: IpoExchange,
): RawListingDay | undefined {
  if (exchange === 'NSE')
    return issue.nseSymbol === null ? undefined : rows.find((r) => r.symbol === issue.nseSymbol);
  return issue.isin === null ? undefined : rows.find((r) => r.isin === issue.isin);
}

/** How many past listing dates one run may fetch files for (each is one request). */
const LISTING_DAYS_PER_RUN = 5;

/**
 * Listing performance from each exchange's end-of-day file: new listings
 * (ISIN, official listing date and — at BSE — the issue price), the
 * listing-day row (frozen once written) for issues that listed recently, and
 * the latest close for issues listed within a year.
 */
export async function ingestIpoListings(
  context: WorkerContext,
  log: Logger,
  options: IpoJobOptions & {
    readonly listingDaysPerRun?: number;
    /** First listing day considered (default `backfill.since`). */
    readonly listedSince?: string;
  } = {},
): Promise<IngestCount> {
  const { config, now, today, sources } = await setup(options, 'listing');
  const listedSince = options.listedSince ?? config.backfill.since;
  let fetched = 0;
  let written = 0;
  for (const { id, source } of sources) {
    const exchange = config.sources[id]?.exchange;
    if (exchange === undefined) continue;
    const count = await withFeedHealth(context, ipoFeedId(id, 'listing'), now, async () => {
      let rows = 0;
      const files = new Map<string, readonly RawListingDay[]>();
      const fileFor = async (date: string) => {
        const cached = files.get(date);
        if (cached !== undefined) return cached;
        const day = await source.fetchListingDay(date);
        files.set(date, day);
        return day;
      };

      // 1. New listings → official listing date, ISIN and (BSE) issue price.
      const identities = await listIssueIdentities(context.db);
      const recent = await source.fetchRecentListings();
      for (const listing of recent) {
        // BSE's list has no ISIN; the listing day's own file row (by trading code) does.
        const isin =
          listing.isin ??
          (exchange === 'BSE'
            ? ((await fileFor(listing.listingDate)).find((r) => r.symbol === listing.symbol)
                ?.isin ?? null)
            : null);
        const match = matchListing(
          {
            companyName: listing.companyName,
            ticker: listing.ticker,
            isin,
            listingDate: listing.listingDate,
          },
          identities,
        );
        if (match.kind !== 'matched') continue;
        const { changed } = await recordSourceObservation(context.db, {
          ipoId: match.id,
          source: listing.source,
          feed: 'recent',
          externalKey: `${listing.source}:${listing.symbol}:${listing.listingDate}`,
          sourceUrl:
            exchange === 'NSE'
              ? 'https://www.nseindia.com/api/new-listing-today?index=RecentListing'
              : 'https://api.bseindia.com/BseIndiaAPI/api/MoreCompanyN/w',
          payload: { ...listing, isin },
          seenAt: now,
        });
        if (changed) {
          rows += 1;
          await resolveIssue(context.db, match.id, config, now);
        }
      }

      // 2. Listing-day rows still missing, NEWEST listing dates first. A date whose
      //    file never has the row (an old issue missing from it) stays "missing" for
      //    ever; oldest-first would retry it every run and starve today's listings.
      //    Every issue listed since the first day of history is considered, so its
      //    latest close (step 3) keeps moving; old dates are the backfill's job.
      const listed = (await listIssuesListedSince(context.db, listedSince)).filter(
        (i) => i.listingDate !== null && i.listingDate <= today && i.exchanges.includes(exchange),
      );
      const have = await issuesWithListingDay(
        context.db,
        exchange,
        listed.map((i) => i.id),
      );
      const missingDates = [
        ...new Set(listed.filter((i) => !have.has(i.id)).map((i) => i.listingDate as string)),
      ]
        .sort()
        .reverse()
        .slice(0, options.listingDaysPerRun ?? LISTING_DAYS_PER_RUN);
      for (const date of missingDates) {
        const day = (await fileFor(date)).filter((r) => r.tradingDate === date);
        for (const issue of listed.filter((i) => i.listingDate === date && !have.has(i.id))) {
          const row = rowFor(day, issue, exchange);
          if (row === undefined) continue;
          const check = listingDayCheck(row, issue);
          if (!check.ok) {
            log.warn('listing-day row does not match the issue; not recorded', {
              issue: issue.id,
              date,
              reason: check.reason,
            });
            continue;
          }
          const done = await recordListingDay(context.db, {
            ipoId: issue.id,
            exchange,
            listingDate: date,
            issuePricePaise: check.issuePricePaise,
            openPaise: row.openPaise,
            highPaise: row.highPaise,
            lowPaise: row.lowPaise,
            closePaise: row.closePaise,
            volume: row.volume,
            source: row.source,
            sourceUrl: row.sourceUrl,
          });
          if (done) rows += 1;
        }
      }

      // 3. Latest close for every issue listed since the first day of history, from today's file.
      const latest = await fileFor(today);
      for (const issue of listed) {
        const row = rowFor(latest, issue, exchange);
        if (row === undefined || issue.listingDate === null || row.tradingDate < issue.listingDate)
          continue;
        if (
          await updateLatestClose(context.db, {
            ipoId: issue.id,
            exchange,
            closePaise: row.closePaise,
            date: row.tradingDate,
          })
        )
          rows += 1;
      }
      log.info('ipo listings ingested', {
        source: id,
        recent: recent.length,
        listingDays: missingDates.length,
        latestFile: latest.length,
        written: rows,
      });
      return { fetched: recent.length + latest.length, written: rows };
    });
    fetched += count.fetched;
    written += count.written;
  }
  return { fetched, written };
}

/** The feed that records a completed history load for one `backfill.since`. */
export const ipoHistoryFeedId = (since: string) => `ipo-history-${since}`;

/**
 * The history load (`--once backfill-ipos`, and once on worker start until it
 * has completed for this `backfill.since`): every issue from that day with its
 * detail page, its final subscription and its listing day, and SEBI's draft
 * filings back to `backfill.filingsSince` linked to their issues. Paced at the
 * backfill interval under one budget. Idempotent: each step fetches only what
 * is still missing, newest first, so a run cut short continues on the next —
 * and the run is recorded as complete only when nothing was cut short.
 */
export async function backfillIpos(
  context: WorkerContext,
  log: Logger,
  options: IpoJobOptions = {},
): Promise<IngestCount> {
  const config = options.config ?? (await loadIpoSourcesConfig());
  const now = options.now ?? new Date();
  const { since, filingsSince } = config.backfill;
  return withFeedHealth(context, ipoHistoryFeedId(since), now, async () => {
    const pacing = {
      maxRequestsPerRun: config.backfill.maxRequests,
      minIntervalMs: config.backfill.minIntervalMs,
      ...(options.transport === undefined ? {} : { transport: options.transport }),
    };
    // One client per source for the whole run, so its budget caps the run.
    const built = new Map<string, BuiltSource>();
    const pacedSources = (feed: string): BuiltSource[] =>
      officialSources(config, feed as Parameters<typeof officialSources>[1], pacing).map(
        (fresh) => {
          const existing = built.get(fresh.id);
          if (existing !== undefined) return existing;
          built.set(fresh.id, fresh);
          return fresh;
        },
      );
    const paced = { ...options, config, sources: options.sources ?? pacedSources };
    const today = istDateKey(now);
    let cutShort = false;
    const budgetSpent = (error: unknown) =>
      error instanceof Error && error.name === 'BudgetExceededError';

    // 1. The issue list, back to `since`.
    const calendar = await ingestIpoCalendar(context, log.child('calendar'), paced);

    // 2. Detail for every issue from `since` that never had one from this
    //    source, or whose detail left the lot unread (a parser since improved
    //    reads it now). Re-fetching the rest would spend the budget later steps need.
    let detailed = 0;
    for (const { id, source } of paced.sources('detail')) {
      const inWindow = await listIssuesOpenedSince(context.db, since);
      const have = await sourceKeysFor(
        context.db,
        id,
        'detail',
        inWindow.map((i) => i.id),
      );
      const issues = inWindow.filter((i) => !have.has(i.id) || i.lotSize === null);
      log.info('history: details to fetch', {
        source: id,
        inWindow: inWindow.length,
        missing: issues.length,
      });
      const keys = await keysFor(context.db, id, issues);
      for (const issue of issues) {
        const key = keys.get(issue.id) ?? null;
        if (key === null) continue;
        try {
          detailed += await observeDetail(context.db, source, issue, key, config, now);
        } catch (error) {
          log.warn('history: detail failed', { issue: issue.id, ...errorFields(error) });
          if (budgetSpent(error)) {
            cutShort = true;
            break;
          }
        }
      }
    }

    // 3. The final consolidated subscription of every closed issue from `since`
    //    that has none (the live job only reads issues closed in the last day).
    //    Mainboard: NSE's category endpoint, stamped with its own final time;
    //    SME: the detail payload's whole book.
    let finals = 0;
    if (!cutShort)
      for (const { id, source } of paced.sources('subscription')) {
        const closed = (await listIssuesOpenedSince(context.db, since)).filter(
          (i) => i.closeDate !== null && i.closeDate < today,
        );
        const have = await issuesWithSubscription(
          context.db,
          'consolidated',
          closed.map((i) => i.id),
        );
        const issues = closed.filter((i) => !have.has(i.id));
        log.info('history: final subscriptions to fetch', { source: id, missing: issues.length });
        const keys = await keysFor(context.db, id, issues);
        for (const issue of issues) {
          const key = keys.get(issue.id) ?? null;
          if (key === null) continue;
          try {
            const subscription = await source.fetchSubscription(key);
            if (subscription !== null)
              finals += await recordSubscription(context.db, issue.id, subscription, now);
          } catch (error) {
            log.warn('history: subscription failed', { issue: issue.id, ...errorFields(error) });
            if (budgetSpent(error)) {
              cutShort = true;
              break;
            }
          }
        }
      }

    // 4. Listing-day prices for every issue listed since `since`, and today's close.
    let listings: IngestCount = { fetched: 0, written: 0 };
    if (!cutShort)
      try {
        listings = await ingestIpoListings(context, log.child('listings'), {
          ...paced,
          listingDaysPerRun: 2_000,
          listedSince: since,
        });
      } catch (error) {
        if (!budgetSpent(error)) throw error;
        cutShort = true;
      }

    // 5. SEBI's draft filings back to `filingsSince`, then linked to issues.
    let filings = 0;
    if (!cutShort)
      for (const { id, source } of options.filings?.() ??
        filingSources(config, { ...pacing, maxRequestsPerRun: 400 })) {
        if (source.fetchFilingsPage === undefined) continue;
        // Stop once a page reaches back past `filingsSince` — or makes no
        // progress (SEBI answering the same page again must not loop).
        let reached = today;
        for (let page = 0; page < 300; page += 1) {
          const rows = await source.fetchFilingsPage(page);
          filings += await upsertSebiFilings(
            context.db,
            rows.map((f) => ({
              sebiId: f.externalKey,
              companyName: f.companyName,
              documentLabel: f.documentLabel,
              title: f.title,
              filedDate: f.filedDate,
              pageUrl: f.pageUrl,
              abridgedUrl: f.abridgedUrl,
            })),
            now,
          );
          const oldest = rows.reduce((min, f) => (f.filedDate < min ? f.filedDate : min), today);
          if (rows.length === 0 || oldest < filingsSince || (page > 0 && oldest >= reached)) break;
          reached = oldest;
        }
        const identities = await listIssueIdentities(context.db);
        let linked = 0;
        for (const filing of await listUnlinkedSebiFilings(context.db, filingsSince)) {
          const ipoId = matchFiling(filing, identities);
          if (ipoId === null) continue;
          await linkSebiFiling(context.db, filing.sebiId, ipoId);
          linked += 1;
        }
        log.info('history: sebi filings read', { source: id, added: filings, linked });
      }

    log.info('ipo history load finished', {
      since,
      issues: calendar.written,
      detailed,
      finals,
      listingRows: listings.written,
      filings,
      complete: !cutShort,
    });
    if (cutShort)
      throw new Error(
        `history load cut short by its request budget (${config.backfill.maxRequests}); the next run continues`,
      );
    return {
      fetched: calendar.fetched + listings.fetched,
      written: calendar.written + detailed + finals + listings.written + filings,
    };
  });
}

/**
 * The UNOFFICIAL grey-market premium (owner decision D1). Each enabled
 * aggregator's quotes are matched to known issues with the strict GMP rule
 * (same board, open AND close dates, name-token containment); a row that does
 * not match exactly one issue is recorded unattached for the operator, never
 * guessed. A "no quote" is stored as a null premium, never as zero. The GMP
 * never touches an official field.
 */
export async function ingestIpoGmp(
  context: WorkerContext,
  log: Logger,
  options: IpoJobOptions = {},
): Promise<IngestCount> {
  const config = options.config ?? (await loadIpoSourcesConfig());
  const now = options.now ?? new Date();
  const sources =
    options.gmp?.() ??
    gmpSources(config, options.transport === undefined ? {} : { transport: options.transport });
  if (sources.length === 0) {
    log.info('no GMP source is enabled; skipped');
    return { fetched: 0, written: 0 };
  }
  let fetched = 0;
  let written = 0;
  for (const { id, source } of sources) {
    const count = await withFeedHealth(context, ipoFeedId(id, 'gmp'), now, async () => {
      const quotes = await source.fetchGmp();
      const identities = await listIssueIdentities(context.db);
      let matched = 0;
      let unmatched = 0;
      let ambiguous = 0;
      const snapshots = [];
      for (const quote of quotes) {
        const match = matchGmpRow(quote, identities);
        const ipoId = match.kind === 'matched' ? match.id : null;
        if (match.kind === 'matched') matched += 1;
        else if (match.kind === 'ambiguous') ambiguous += 1;
        else unmatched += 1;
        await recordSourceObservation(context.db, {
          ipoId,
          source: quote.source,
          feed: 'gmp',
          externalKey: quote.externalKey,
          sourceUrl: quote.pageUrl,
          payload: { ...quote, updatedAt: quote.updatedAt?.toISOString() ?? null },
          seenAt: now,
        });
        if (ipoId === null) continue;
        snapshots.push({
          ipoId,
          source: quote.source,
          observedAt: quote.updatedAt ?? now,
          observedAtBasis: quote.updatedAt === null ? ('fetched' as const) : ('stated' as const),
          gmpPaise: quote.gmpPaise,
          rangeLowPaise: quote.rangeLowPaise,
          rangeHighPaise: quote.rangeHighPaise,
          sourceUrl: quote.pageUrl,
        });
      }
      const rows = await insertGmpSnapshots(context.db, snapshots);
      log.info('ipo gmp ingested (unofficial)', {
        source: id,
        quotes: quotes.length,
        matched,
        unmatched,
        ambiguous,
        written: rows,
      });
      return { fetched: quotes.length, written: rows };
    });
    fetched += count.fetched;
    written += count.written;
  }
  return { fetched, written };
}

// ---------------------------------------------------------------------------
// SEBI filings (Phase 11)
// ---------------------------------------------------------------------------

/**
 * DRHPs and their addenda from the regulator's filings list. A filing is
 * stored on its own — it never creates or changes an issue — and linked to an
 * issue only when `matchFiling` finds exactly one by name. Unlinked filings
 * are re-tried on later runs, so one filed before its issue appears on the
 * exchange links once the issue does.
 */
export async function ingestSebiFilings(
  context: WorkerContext,
  log: Logger,
  options: IpoJobOptions = {},
): Promise<IngestCount> {
  const config = options.config ?? (await loadIpoSourcesConfig());
  const now = options.now ?? new Date();
  const sources =
    options.filings?.() ??
    filingSources(config, options.transport === undefined ? {} : { transport: options.transport });
  if (sources.length === 0) {
    log.info('no filings source is enabled; skipped');
    return { fetched: 0, written: 0 };
  }
  let fetched = 0;
  let written = 0;
  for (const { id, source } of sources) {
    const count = await withFeedHealth(context, ipoFeedId(id, 'filings'), now, async () => {
      const filings = await source.fetchFilings();
      const added = await upsertSebiFilings(
        context.db,
        filings.map((f) => ({
          sebiId: f.externalKey,
          companyName: f.companyName,
          documentLabel: f.documentLabel,
          title: f.title,
          filedDate: f.filedDate,
          pageUrl: f.pageUrl,
          abridgedUrl: f.abridgedUrl,
        })),
        now,
      );
      const identities = await listIssueIdentities(context.db);
      const unlinked = await listUnlinkedSebiFilings(context.db, addDays(istDateKey(now), -550));
      let linked = 0;
      for (const filing of unlinked) {
        const ipoId = matchFiling(filing, identities);
        if (ipoId === null) continue;
        await linkSebiFiling(context.db, filing.sebiId, ipoId);
        linked += 1;
      }
      log.info('sebi filings ingested', { source: id, read: filings.length, added, linked });
      return { fetched: filings.length, written: added };
    });
    fetched += count.fetched;
    written += count.written;
  }
  return { fetched, written };
}
