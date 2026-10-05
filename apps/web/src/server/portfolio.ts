import 'server-only';
import {
  derivePortfolio,
  type ParsedRow,
  type PortfolioEntry,
  parsePortfolioFile,
  reconcileHolding,
  type ShareChange,
  summarisePortfolio,
} from '@equitywise/core';
import {
  corporateHistoryFrom,
  dailyClosesBetween,
  deleteAllHoldingEntries,
  deleteHoldingEntry,
  dividendsBetween,
  fairMarketValuesFor,
  fairMarketValuesLoaded,
  getInstrumentBySymbol,
  type HoldingEntryRow,
  holdingReference,
  indexInstrumentIds,
  instrumentIsins,
  latestDailyCloses,
  latestIndicatorsForInstruments,
  latestQuotesForInstruments,
  listHoldingEntries,
  listInstrumentsById,
  listShareChanges,
  MAX_PORTFOLIO_ENTRIES,
  type PortfolioUsageEvent,
  recordPortfolioUsage,
  resolveInstrumentIds,
  upcomingHoldingEvents,
  updateHoldingEntry,
  writeHoldingEntries,
} from '@equitywise/db';
import { z } from 'zod';
import { composeAnalysis, type HoldingRef } from '@/lib/portfolio-analysis';
import {
  composeReturns,
  headlineReturn,
  lotsFor,
  realisedCsv,
  valueForReturns,
} from '@/lib/portfolio-returns';
import { BENCHMARKS, composeBenchmark, composeTax, taxCsv } from '@/lib/portfolio-tax';
import type {
  HoldingDetailDto,
  ImportPreviewDto,
  ImportRowDto,
  PortfolioAnalysisDto,
  PortfolioBenchmarkDto,
  PortfolioDto,
  PortfolioEntryDto,
  PortfolioReturnsDto,
  PortfolioTaxDto,
  UpcomingEventDto,
} from '@/lib/portfolio-types';
import { getSessionUser } from './auth/require-user';
import { getDatabase } from './db';
import { MarketDataError } from './errors';

/**
 * The signed-in user's own portfolio: shares they typed in or uploaded themselves.
 *
 * PRIVATE (CLAUDE.md rule 9). Every statement is scoped by the owner inside
 * `repositories/portfolio.ts`. Nothing in this file logs a symbol, a share count
 * or an amount, and errors carry only plain sentences.
 */

/** Longest file we will read, as text. A year of active trades is well under this. */
export const MAX_IMPORT_BYTES = 1_000_000;

async function requireOwnerId(): Promise<number> {
  const user = await getSessionUser();
  if (user === null) {
    throw new MarketDataError('Not signed in.', {
      code: 'UNAUTHENTICATED',
      status: 401,
      remedy: 'Sign in and try again.',
    });
  }
  return user.id;
}

/** Today's date in India, as YYYY-MM-DD. A trade cannot be dated after it. */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

const STALE_AFTER_MS = 3 * 24 * 3_600_000;

/** A bonus or split on the calendar for the same stock, on or before a dividend's ex-date. */
function shareChangeBefore(
  events: readonly { instrumentId: number; eventType: string; eventDate: string }[],
  e: { instrumentId: number; eventType: string; eventDate: string },
): { kind: string; date: string } | null {
  if (e.eventType !== 'dividend') return null;
  const change = events.find(
    (x) =>
      x.instrumentId === e.instrumentId &&
      (x.eventType === 'bonus' || x.eventType === 'stock_split') &&
      x.eventDate <= e.eventDate,
  );
  return change === undefined
    ? null
    : { kind: change.eventType === 'bonus' ? 'bonus' : 'split', date: change.eventDate };
}

/** How far ahead "Coming up" looks. */
const UPCOMING_DAYS = 60;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function toEntry(row: HoldingEntryRow): PortfolioEntry {
  return {
    id: row.id,
    instrumentId: row.instrumentId,
    kind: row.kind,
    tradeDate: row.tradeDate,
    acquiredOn: row.acquiredOn,
    shares: row.shares,
    amountPaise: row.amountPaise,
  };
}

/** Counts a use of the page (counts only, never contents). Never fails the request. */
async function countUse(ownerId: number, event: PortfolioUsageEvent): Promise<void> {
  await recordPortfolioUsage(getDatabase(), ownerId, event).catch(() => undefined);
}

async function shareChangesFor(instrumentIds: readonly number[]): Promise<ShareChange[]> {
  return listShareChanges(getDatabase(), [...new Set(instrumentIds)]);
}

/** A sentence for the first problem a ledger has, or null when it is consistent. */
function firstProblem(
  ledger: readonly HoldingEntryRow[],
  changes: readonly ShareChange[],
): string | null {
  const result = derivePortfolio(ledger.map(toEntry), changes);
  const problem = result.problems[0];
  if (problem === undefined) return null;
  const row = ledger.find((entry) => entry.id === problem.entryId);
  const who = row === undefined ? 'a stock' : row.symbol;
  return `${who}: that would remove more shares than you held on that date (${problem.held}). Add the earlier entries first.`;
}

interface Built {
  readonly dto: PortfolioDto;
  readonly ledger: readonly HoldingEntryRow[];
  readonly entries: readonly PortfolioEntry[];
  readonly changes: readonly ShareChange[];
  readonly derived: ReturnType<typeof derivePortfolio>;
  readonly historyFrom: string | null;
}

async function buildPortfolio(ownerId: number): Promise<Built> {
  const db = getDatabase();
  const ledger = await listHoldingEntries(db, ownerId);
  const ids = [...new Set(ledger.map((entry) => entry.instrumentId))];
  const [changes, cached, historyFrom] = await Promise.all([
    shareChangesFor(ids),
    latestQuotesForInstruments(db, ids).catch(() => new Map()),
    corporateHistoryFrom(db).catch(() => null),
  ]);
  // Anything the live-quote cache has not reached yet falls back to its last stored close.
  const missing = ids.filter((id) => !cached.has(id));
  const closes = await latestDailyCloses(db, missing).catch(() => new Map());

  const prices = new Map<
    number,
    { ltpPaise: number; previousClosePaise: number | null; source: 'quote' | 'close'; at: Date }
  >();
  for (const [id, q] of cached)
    prices.set(id, {
      ltpPaise: q.ltpPaise,
      previousClosePaise: q.previousClosePaise,
      source: 'quote',
      at: q.fetchedAt,
    });
  for (const [id, c] of closes)
    prices.set(id, {
      ltpPaise: c.closePaise,
      previousClosePaise: c.previousClosePaise,
      source: 'close',
      at: c.at,
    });

  const derived = derivePortfolio(ledger.map(toEntry), changes);
  const heldIds = derived.holdings.map((h) => h.instrumentId);
  const today = todayInIndia();
  const events = await upcomingHoldingEvents(
    db,
    heldIds,
    today,
    addDays(today, UPCOMING_DAYS),
  ).catch(() => []);
  const summary = summarisePortfolio(
    derived.holdings,
    new Map(
      [...prices].map(([id, p]) => [
        id,
        { ltpPaise: p.ltpPaise, previousClosePaise: p.previousClosePaise },
      ]),
    ),
  );
  const names = new Map(ledger.map((entry) => [entry.instrumentId, entry]));

  let newest: Date | null = null;
  for (const p of prices.values()) if (newest === null || p.at > newest) newest = p.at;

  const dto: PortfolioDto = {
    returns: null,
    hasRemovals: ledger.some((entry) => entry.kind === 'remove'),
    holdings: [...summary.holdings]
      .sort((x, y) => (y.valuePaise ?? y.costPaise) - (x.valuePaise ?? x.costPaise))
      .map((h) => {
        const info = names.get(h.instrumentId);
        const price = prices.get(h.instrumentId);
        return {
          instrumentId: h.instrumentId,
          symbol: info?.symbol ?? '',
          name: info?.name ?? '',
          shares: h.shares,
          costPaise: h.costPaise,
          avgCostPaise: h.avgCostPaise,
          ltpPaise: price?.ltpPaise ?? null,
          priceSource: price?.source ?? null,
          priceAsOf: price?.at.toISOString() ?? null,
          valuePaise: h.valuePaise,
          gainPaise: h.gainPaise,
          gainRatio: h.gainRatio,
          dayChangePaise: h.dayChangePaise,
          dayChangeRatio: h.dayChangeRatio,
          weight: h.weight,
          adjustments: [...h.adjustments],
          // A purchase older than the split/bonus record could be missing an adjustment.
          historyGapBefore:
            historyFrom !== null && h.lots.some((lot) => lot.acquiredOn < historyFrom)
              ? historyFrom
              : null,
        };
      }),
    entries: ledger.slice(0, 500).map(toEntryDto),
    entryCount: ledger.length,
    entryLimit: MAX_PORTFOLIO_ENTRIES,
    totals: {
      valuePaise: summary.valuePaise,
      costPaise: summary.costPaise,
      gainPaise: summary.gainPaise,
      gainRatio: summary.gainRatio,
      dayChangePaise: summary.dayChangePaise,
      dayChangeRatio: summary.dayChangeRatio,
      pricedCostPaise: summary.pricedCostPaise,
      unpriced: summary.unpriced,
    },
    pricesAsOf: newest?.toISOString() ?? null,
    pricesStale: newest !== null && Date.now() - newest.getTime() > STALE_AFTER_MS,
    upcoming: events.flatMap((e): UpcomingEventDto[] => {
      const info = names.get(e.instrumentId);
      const held = derived.holdings.find((x) => x.instrumentId === e.instrumentId);
      if (info === undefined || held === undefined) return [];
      return [
        {
          symbol: info.symbol,
          name: info.name,
          eventType: e.eventType,
          eventDate: e.eventDate,
          title: e.title,
          dividendPaise: e.dividendPaise,
          shares: held.shares,
          shareChangeBefore: shareChangeBefore(events, e),
        },
      ];
    }),
    problems: derived.problems.map((problem) => {
      const row = ledger.find((entry) => entry.id === problem.entryId);
      return `${row?.symbol ?? 'A stock'}: an entry removes more shares than you held on that date.`;
    }),
  };
  return { dto, ledger, entries: ledger.map(toEntry), changes, derived, historyFrom };
}

function toEntryDto(entry: HoldingEntryRow): PortfolioEntryDto {
  return {
    id: entry.id,
    symbol: entry.symbol,
    name: entry.name,
    kind: entry.kind,
    tradeDate: entry.tradeDate,
    acquiredOn: entry.acquiredOn,
    shares: entry.shares,
    amountPaise: entry.amountPaise,
    source: entry.source,
  };
}

/** Daily closes and dividend records for every stock the user has entries for. */
async function returnInputs(built: Built) {
  const db = getDatabase();
  const ids = [...new Set(built.ledger.map((entry) => entry.instrumentId))];
  const first = built.ledger.reduce<string | null>(
    (a, e) => (a === null || e.tradeDate < a ? e.tradeDate : a),
    null,
  );
  const today = todayInIndia();
  if (first === null) return { closes: new Map(), dividendRecords: [], today };
  const [closes, dividendRecords] = await Promise.all([
    // A few days earlier than the first entry, so an entry on a holiday finds the last close.
    dailyClosesBetween(db, ids, addDays(first, -10), today).catch(() => new Map()),
    dividendsBetween(db, ids, first, today).catch(() => []),
  ]);
  return { closes, dividendRecords, today };
}

function namesOf(ledger: readonly HoldingEntryRow[]) {
  return new Map(
    ledger.map((entry) => [entry.instrumentId, { symbol: entry.symbol, name: entry.name }]),
  );
}

export async function getPortfolio(): Promise<PortfolioDto> {
  const ownerId = await requireOwnerId();
  const built = await buildPortfolio(ownerId);
  await countUse(ownerId, 'view');
  if (built.ledger.length === 0) return built.dto;
  const inputs = await returnInputs(built);
  const returns = headlineReturn({
    entries: built.entries,
    changes: built.changes,
    holdings: built.dto.holdings,
    ...inputs,
  });
  return { ...built.dto, returns };
}

type ReturnInputs = Awaited<ReturnType<typeof returnInputs>>;

/** Everything the Returns tab shows. */
function returnsFor(built: Built, inputs: ReturnInputs): PortfolioReturnsDto {
  return composeReturns({
    entries: built.entries,
    names: namesOf(built.ledger),
    changes: built.changes,
    derived: built.derived,
    holdings: built.dto.holdings,
    historyFrom: built.historyFrom,
    ...inputs,
  });
}

/** Nifty 50 / Nifty 500 closes from a little before the first entry to today. */
async function indexClosesFor(
  built: Built,
): Promise<Map<string, { date: string; closePaise: number }[]>> {
  const db = getDatabase();
  const first = built.ledger.reduce<string | null>(
    (a, e) => (a === null || e.tradeDate < a ? e.tradeDate : a),
    null,
  );
  if (first === null) return new Map();
  const ids = await indexInstrumentIds(
    db,
    BENCHMARKS.map((b) => b.symbol),
  ).catch(() => new Map<string, number>());
  const closes = await dailyClosesBetween(
    db,
    [...ids.values()],
    addDays(first, -10),
    todayInIndia(),
  ).catch(() => new Map<number, { date: string; closePaise: number }[]>());
  return new Map([...ids].map(([symbol, id]) => [symbol, closes.get(id) ?? []]));
}

async function benchmarkFor(built: Built, inputs: ReturnInputs): Promise<PortfolioBenchmarkDto> {
  const indexCloses = await indexClosesFor(built);
  return composeBenchmark({
    entries: built.entries,
    changes: built.changes,
    closes: inputs.closes,
    indexCloses,
    valuePaise: valueForReturns(built.dto.holdings).valuePaise,
    today: inputs.today,
  });
}

async function taxFor(built: Built, inputs: ReturnInputs): Promise<PortfolioTaxDto> {
  const db = getDatabase();
  const ids = [...new Set(built.ledger.map((e) => e.instrumentId))];
  const [fmv2018, fmvLoaded, isins] = await Promise.all([
    fairMarketValuesFor(db, ids).catch(() => new Map<number, number>()),
    fairMarketValuesLoaded(db).catch(() => false),
    instrumentIsins(db, ids).catch(() => new Map<number, string>()),
  ]);
  return composeTax({
    entries: built.entries,
    changes: built.changes,
    derived: built.derived,
    names: namesOf(built.ledger),
    isins,
    fmv2018,
    fmvLoaded,
    dividendRecords: inputs.dividendRecords,
    today: inputs.today,
  });
}

/** One financial year's sales as CSV for the user's accountant; null for a year with none. */
export async function getTaxCsv(year: string): Promise<string | null> {
  const ownerId = await requireOwnerId();
  const built = await buildPortfolio(ownerId);
  const tax = await taxFor(built, await returnInputs(built));
  const summary = tax.byYear[year];
  return summary === undefined ? null : taxCsv(summary);
}

/** The realised-gains CSV for the user's records. */
export async function getRealisedCsv(): Promise<string> {
  const ownerId = await requireOwnerId();
  const built = await buildPortfolio(ownerId);
  const returns = returnsFor(built, await returnInputs(built));
  return realisedCsv(returns.realisedRows);
}

/**
 * Phase 2 analysis: where the money sits (sector, company size, treemap), how
 * concentrated it is, what moved the gain, and plain facts worth a look. Built
 * from the same derived holdings as the overview, so the totals always agree.
 */
export async function getPortfolioAnalysis(): Promise<{
  analysis: PortfolioAnalysisDto;
  returns: PortfolioReturnsDto | null;
  benchmark: PortfolioBenchmarkDto | null;
  tax: PortfolioTaxDto | null;
}> {
  const ownerId = await requireOwnerId();
  const built = await buildPortfolio(ownerId);
  const { dto } = built;
  const pricedIds = dto.holdings.filter((h) => h.valuePaise !== null).map((h) => h.instrumentId);
  const reference = await holdingReference(getDatabase(), pricedIds).catch(
    () => new Map<number, HoldingRef>(),
  );
  await countUse(ownerId, 'view');
  if (built.ledger.length === 0)
    return { analysis: composeAnalysis(dto, reference), returns: null, benchmark: null, tax: null };
  // Closes and dividends since the first entry are read once for all three tabs.
  const inputs = await returnInputs(built);
  const [benchmark, tax] = await Promise.all([benchmarkFor(built, inputs), taxFor(built, inputs)]);
  const returns = returnsFor(built, inputs);
  return { analysis: composeAnalysis(dto, reference), returns, benchmark, tax };
}

/** One holding with every entry behind it, or null when the user holds none of that stock. */
export async function getHoldingDetail(symbol: string): Promise<HoldingDetailDto | null> {
  const ownerId = await requireOwnerId();
  const built = await buildPortfolio(ownerId);
  const { dto, ledger } = built;
  const wanted = symbol.toUpperCase();
  const holding = dto.holdings.find((h) => h.symbol === wanted);
  if (holding === undefined) return null;
  const returns = returnsFor(built, await returnInputs(built));
  const own = returns.perHolding.find((p) => p.symbol === holding.symbol);
  const indicators = await latestIndicatorsForInstruments(getDatabase(), [
    holding.instrumentId,
  ]).catch(() => new Map());
  const range = indicators.get(holding.instrumentId);
  return {
    holding,
    entries: ledger.filter((entry) => entry.instrumentId === holding.instrumentId).map(toEntryDto),
    low52wPaise: range?.low52w ?? null,
    high52wPaise: range?.high52w ?? null,
    portfolioWeight: holding.weight,
    pricesStale: dto.pricesStale,
    lots: lotsFor(built.derived, holding.instrumentId, todayInIndia()),
    realised: returns.realisedRows.filter((r) => r.symbol === holding.symbol),
    dividends: returns.dividends.rows.filter((d) => d.symbol === holding.symbol),
    totalReturnPaise: own?.totalPaise ?? null,
  };
}

// ---------------------------------------------------------------------------
// Adding one entry by hand
// ---------------------------------------------------------------------------

export const addEntrySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, 'Choose a stock.')
    .max(40)
    .transform((value) => value.toUpperCase()),
  kind: z.enum(['opening', 'add', 'remove']),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as YYYY-MM-DD.'),
  shares: z
    .number()
    .int('Shares must be a whole number.')
    .min(1, 'Enter at least 1 share.')
    .max(1_000_000_000),
  /** Integer paise a share. */
  pricePaise: z.number().int().min(1, 'Enter the price a share.').max(100_000_000_00),
  chargesPaise: z.number().int().min(0).max(100_000_000_00).default(0),
  /** Shares I own now: when they were really bought, if known. Holding period only. */
  acquiredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the purchase date as YYYY-MM-DD.')
    .nullish(),
});

/** A purchase date, if given, must be a real day, not after the entry's date. */
function checkAcquiredOn(
  acquiredOn: string | null | undefined,
  tradeDate: string,
): MutationOutcome | null {
  if (acquiredOn === null || acquiredOn === undefined) return null;
  if (!realDate(acquiredOn)) return fail(400, 'INVALID_DATE', 'That purchase date does not exist.');
  if (acquiredOn > tradeDate)
    return fail(
      400,
      'ACQUIRED_AFTER_ENTRY',
      'The purchase date cannot be after the date the numbers are true on.',
    );
  return null;
}

export type MutationOutcome =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string; remedy?: string };

const fail = (status: number, code: string, message: string, remedy?: string): MutationOutcome => ({
  ok: false,
  status,
  code,
  message,
  ...(remedy === undefined ? {} : { remedy }),
});

function realDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function addPortfolioEntry(
  input: z.infer<typeof addEntrySchema>,
): Promise<MutationOutcome> {
  const ownerId = await requireOwnerId();
  if (!realDate(input.tradeDate)) return fail(400, 'INVALID_DATE', 'That date does not exist.');
  if (input.tradeDate > todayInIndia())
    return fail(400, 'FUTURE_DATE', 'The date cannot be in the future.');
  const acquired = input.kind === 'opening' ? (input.acquiredOn ?? null) : null;
  const badAcquired = checkAcquiredOn(acquired, input.tradeDate);
  if (badAcquired !== null) return badAcquired;
  const db = getDatabase();
  const instrument = await getInstrumentBySymbol(db, input.symbol, 'NSE');
  if (instrument === null) {
    return fail(
      404,
      'UNKNOWN_SYMBOL',
      `We don't have "${input.symbol}".`,
      'Search for the stock by name and use its NSE symbol.',
    );
  }
  const gross = input.shares * input.pricePaise;
  const amountPaise =
    input.kind === 'remove' ? Math.max(gross - input.chargesPaise, 0) : gross + input.chargesPaise;
  if (!Number.isSafeInteger(amountPaise))
    return fail(400, 'AMOUNT_TOO_LARGE', 'That amount is too large.');

  const existing = await listHoldingEntries(db, ownerId);
  const changes = await shareChangesFor([
    instrument.id,
    ...existing.map((entry) => entry.instrumentId),
  ]);
  const written = await writeHoldingEntries(db, ownerId, {
    rows: [
      {
        instrumentId: instrument.id,
        kind: input.kind,
        tradeDate: input.tradeDate,
        shares: input.shares,
        amountPaise,
        source: 'manual',
        acquiredOn: acquired,
      },
    ],
    validate: (ledger) => firstProblem(ledger, changes),
  });
  if (written.ok) {
    await countUse(ownerId, 'add');
    return { ok: true };
  }
  if (written.reason === 'limit_reached') {
    return fail(
      409,
      'ENTRY_LIMIT',
      `You can keep up to ${MAX_PORTFOLIO_ENTRIES} entries.`,
      'Delete entries you no longer need.',
    );
  }
  return fail(409, 'WOULD_OVERSELL', written.message);
}

export const editEntrySchema = z.object({
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as YYYY-MM-DD.'),
  shares: z
    .number()
    .int('Shares must be a whole number.')
    .min(1, 'Enter at least 1 share.')
    .max(1_000_000_000),
  totalPaise: z.number().int().min(0).max(1_000_000_000_000_00),
  /** Only stored on an opening entry; null clears it, omitted leaves it. */
  acquiredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the purchase date as YYYY-MM-DD.')
    .nullish(),
});

export async function editPortfolioEntry(
  id: number,
  input: z.infer<typeof editEntrySchema>,
): Promise<MutationOutcome> {
  const ownerId = await requireOwnerId();
  if (!realDate(input.tradeDate)) return fail(400, 'INVALID_DATE', 'That date does not exist.');
  if (input.tradeDate > todayInIndia())
    return fail(400, 'FUTURE_DATE', 'The date cannot be in the future.');
  const db = getDatabase();
  const existing = await listHoldingEntries(db, ownerId);
  const target = existing.find((entry) => entry.id === id);
  const acquiredOn = target?.kind === 'opening' ? input.acquiredOn : undefined;
  const badAcquired = checkAcquiredOn(acquiredOn, input.tradeDate);
  if (badAcquired !== null) return badAcquired;
  const changes = await shareChangesFor(existing.map((entry) => entry.instrumentId));
  const result = await updateHoldingEntry(
    db,
    ownerId,
    id,
    {
      tradeDate: input.tradeDate,
      shares: input.shares,
      amountPaise: input.totalPaise,
      ...(acquiredOn === undefined ? {} : { acquiredOn }),
    },
    (ledger) => firstProblem(ledger, changes),
  );
  if (!result.ok)
    return fail(
      409,
      'WOULD_OVERSELL',
      result.reason === 'rejected' ? result.message : 'Could not save that change.',
    );
  return result.value ? { ok: true } : fail(404, 'NOT_FOUND', 'That entry no longer exists.');
}

export async function removePortfolioEntry(id: number): Promise<MutationOutcome> {
  const ownerId = await requireOwnerId();
  const db = getDatabase();
  const existing = await listHoldingEntries(db, ownerId);
  const changes = await shareChangesFor(existing.map((entry) => entry.instrumentId));
  const result = await deleteHoldingEntry(db, ownerId, id, (ledger) =>
    firstProblem(ledger, changes),
  );
  if (!result.ok)
    return fail(
      409,
      'WOULD_OVERSELL',
      result.reason === 'rejected' ? result.message : 'Could not delete that entry.',
    );
  return result.value ? { ok: true } : fail(404, 'NOT_FOUND', 'That entry no longer exists.');
}

export async function clearPortfolio(): Promise<number> {
  return deleteAllHoldingEntries(getDatabase(), await requireOwnerId());
}

// ---------------------------------------------------------------------------
// Importing a file
// ---------------------------------------------------------------------------

/** Broker symbols sometimes carry a series suffix ("-BE"); try the plain symbol too. */
export function symbolCandidates(raw: string): string[] {
  const upper = raw.toUpperCase();
  const stripped = upper.replace(/-[A-Z]{1,2}$/, '');
  return stripped === upper ? [upper] : [upper, stripped];
}

interface ResolvedRow {
  readonly parsed: ParsedRow;
  readonly instrumentId: number | null;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly status: ParsedRow['status'];
  readonly message: string;
}

async function resolveRows(rows: readonly ParsedRow[]): Promise<ResolvedRow[]> {
  const db = getDatabase();
  const wanted = [...new Set(rows.flatMap((row) => symbolCandidates(row.symbol)))];
  const ids = await resolveInstrumentIds(db, wanted, 'NSE');
  const named = await listInstrumentsById(db, [...ids.values()]);
  const nameById = new Map(named.map((item) => [item.id, item.name]));
  return rows.map((parsed) => {
    const hit = symbolCandidates(parsed.symbol).find((candidate) => ids.has(candidate));
    const instrumentId = hit === undefined ? null : (ids.get(hit) ?? null);
    if (instrumentId === null) {
      return {
        parsed,
        instrumentId: null,
        symbol: null,
        name: null,
        status: 'skipped' as const,
        message:
          parsed.status === 'skipped'
            ? parsed.message
            : `Skipped: we do not have "${parsed.symbol}" on the NSE list.`,
      };
    }
    return {
      parsed,
      instrumentId,
      symbol: hit ?? null,
      name: nameById.get(instrumentId) ?? null,
      status: parsed.status,
      message: parsed.message,
    };
  });
}

export type PreviewOutcome =
  | { ok: true; preview: ImportPreviewDto }
  | { ok: false; status: number; code: string; message: string };

interface PlannedRow {
  readonly line: number;
  readonly fileSymbol: string;
  readonly instrumentId: number | null;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly kind: 'opening' | 'add' | 'remove';
  readonly tradeDate: string;
  readonly shares: number;
  readonly amountPaise: number;
  readonly tradeId: string | null;
  readonly status: 'ready' | 'check' | 'skipped';
  readonly message: string;
}

type ImportPlan =
  | { ok: true; fileKind: 'holdings' | 'trades'; rows: PlannedRow[]; notInFile: string[] }
  | { ok: false; status: number; code: string; message: string };

/**
 * What an import would do, row by row. The preview shows exactly this, and the
 * commit re-plans from the file and writes exactly this, so the two can never
 * disagree.
 *
 * A holdings file never deletes the user's dated entries. Each stock is
 * reconciled (`reconcileHolding`): new stocks are opened, matching counts are
 * left alone, and a different count becomes one entry for the difference,
 * dated today, marked Check.
 */
async function planImport(ownerId: number, text: string): Promise<ImportPlan> {
  if (text.length > MAX_IMPORT_BYTES)
    return {
      ok: false,
      status: 413,
      code: 'FILE_TOO_LARGE',
      message: 'That file is too large to import.',
    };
  const today = todayInIndia();
  const parsed = parsePortfolioFile(text, today);
  if (!parsed.ok) return { ok: false, status: 400, code: parsed.code, message: parsed.message };
  const resolved = await resolveRows(parsed.rows);
  const base = (r: (typeof resolved)[number]): PlannedRow => ({
    line: r.parsed.line,
    fileSymbol: r.parsed.symbol,
    instrumentId: r.instrumentId,
    symbol: r.symbol,
    name: r.name,
    kind: r.parsed.kind,
    tradeDate: r.parsed.tradeDate,
    shares: r.parsed.shares,
    amountPaise: r.parsed.amountPaise,
    tradeId: r.parsed.tradeId,
    status: r.status,
    message: r.message,
  });
  if (parsed.fileKind === 'trades') {
    return { ok: true, fileKind: 'trades', rows: resolved.map(base), notInFile: [] };
  }

  const { dto } = await buildPortfolio(ownerId);
  const held = new Map(dto.holdings.map((h) => [h.instrumentId, h]));
  const seen = new Set<number>();
  const rows = resolved.map((r): PlannedRow => {
    const row = base(r);
    if (r.instrumentId === null || r.status === 'skipped') return row;
    if (seen.has(r.instrumentId)) {
      return {
        ...row,
        status: 'skipped',
        message: 'Skipped: this stock appears more than once in the file.',
      };
    }
    seen.add(r.instrumentId);
    const current = held.get(r.instrumentId);
    const plan = reconcileHolding({
      fileShares: r.parsed.shares,
      fileAmountPaise: r.parsed.amountPaise,
      current:
        current === undefined ? null : { shares: current.shares, costPaise: current.costPaise },
      pricePaise: current?.ltpPaise ?? null,
    });
    if (plan.action === 'skip' || plan.action === 'cannot') {
      return {
        ...row,
        shares: r.parsed.shares,
        amountPaise: 0,
        status: 'skipped',
        message: plan.message,
      };
    }
    // A file-level doubt (average cost and invested disagree) still needs a look.
    const status = plan.status === 'check' || r.status === 'check' ? 'check' : 'ready';
    const message = r.status === 'check' && plan.action === 'opening' ? r.message : plan.message;
    return {
      ...row,
      kind: plan.action,
      tradeDate: today,
      shares: plan.shares,
      amountPaise: plan.amountPaise,
      status,
      message,
    };
  });
  const inFile = new Set(rows.filter((r) => r.instrumentId !== null).map((r) => r.instrumentId));
  const notInFile = dto.holdings.filter((h) => !inFile.has(h.instrumentId)).map((h) => h.symbol);
  return { ok: true, fileKind: 'holdings', rows, notInFile };
}

export async function previewPortfolioImport(text: string): Promise<PreviewOutcome> {
  const ownerId = await requireOwnerId();
  const plan = await planImport(ownerId, text);
  if (!plan.ok) return plan;
  const rows: ImportRowDto[] = plan.rows.map((r) => ({
    line: r.line,
    fileSymbol: r.fileSymbol,
    symbol: r.symbol,
    name: r.name,
    kind: r.kind,
    tradeDate: r.tradeDate,
    shares: r.shares,
    amountPaise: r.amountPaise,
    status: r.status,
    message: r.message,
  }));
  const counts = { ready: 0, check: 0, skipped: 0 };
  for (const row of rows) counts[row.status] += 1;
  return {
    ok: true,
    preview: { fileKind: plan.fileKind, rows, counts, notInFile: plan.notInFile },
  };
}

export const importSchema = z.object({
  text: z
    .string()
    .min(1, 'Choose a file.')
    .max(MAX_IMPORT_BYTES, 'That file is too large to import.'),
  /** Also save the rows marked "Check". Off by default: they need a person's eye. */
  includeChecked: z.boolean().default(false),
});

/** The import route's body: preview by default, save when `commit` is true. */
export const importBodySchema = importSchema.extend({ commit: z.boolean().default(false) });

export type CommitOutcome =
  | { ok: true; inserted: number; skippedDuplicates: number }
  | { ok: false; status: number; code: string; message: string; remedy?: string };

export async function commitPortfolioImport(
  input: z.infer<typeof importSchema>,
): Promise<CommitOutcome> {
  const ownerId = await requireOwnerId();
  const plan = await planImport(ownerId, input.text);
  if (!plan.ok) return plan;
  const accepted = plan.rows.filter(
    (r) =>
      r.instrumentId !== null &&
      r.shares > 0 &&
      (r.status === 'ready' || (input.includeChecked && r.status === 'check')),
  );
  if (accepted.length === 0)
    return {
      ok: false,
      status: 400,
      code: 'NOTHING_TO_IMPORT',
      message: 'No rows in the file need importing.',
      remedy:
        'Rows marked Skipped already match or cannot be read; rows marked Check need the box ticked.',
    };

  const db = getDatabase();
  const existing = await listHoldingEntries(db, ownerId);
  const instrumentIds = accepted.map((r) => r.instrumentId as number);
  const changes = await shareChangesFor([
    ...instrumentIds,
    ...existing.map((entry) => entry.instrumentId),
  ]);
  const written = await writeHoldingEntries(db, ownerId, {
    rows: accepted.map((r) => ({
      instrumentId: r.instrumentId as number,
      kind: r.kind,
      tradeDate: r.tradeDate,
      shares: r.shares,
      amountPaise: r.amountPaise,
      source: 'file' as const,
      tradeId: r.tradeId,
    })),
    validate: (ledger) => firstProblem(ledger, changes),
  });
  if (written.ok) {
    await countUse(ownerId, 'import');
    return {
      ok: true,
      inserted: written.value.inserted,
      skippedDuplicates: written.value.skippedDuplicates,
    };
  }
  if (written.reason === 'limit_reached')
    return {
      ok: false,
      status: 409,
      code: 'ENTRY_LIMIT',
      message: `You can keep up to ${MAX_PORTFOLIO_ENTRIES} entries.`,
      remedy: 'Delete entries you no longer need.',
    };
  return { ok: false, status: 409, code: 'WOULD_OVERSELL', message: written.message };
}
