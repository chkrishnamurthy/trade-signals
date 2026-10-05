import 'server-only';
import {
  companySizeByIndex,
  concentration,
  derivePortfolio,
  groupByWeight,
  type ParsedRow,
  type PortfolioEntry,
  parsePortfolioFile,
  type ShareChange,
  summarisePortfolio,
  topContributors,
} from '@equitywise/core';
import {
  deleteAllHoldingEntries,
  deleteHoldingEntry,
  getInstrumentBySymbol,
  type HoldingEntryRow,
  holdingReference,
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
import { attentionFacts, SIZE_LABEL, UNCLASSIFIED_SECTOR } from '@/lib/portfolio-facts';
import type {
  AnalysisHoldingDto,
  HoldingDetailDto,
  ImportPreviewDto,
  ImportRowDto,
  PortfolioAnalysisDto,
  PortfolioDto,
  PortfolioEntryDto,
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
}

async function buildPortfolio(ownerId: number): Promise<Built> {
  const db = getDatabase();
  const ledger = await listHoldingEntries(db, ownerId);
  const ids = [...new Set(ledger.map((entry) => entry.instrumentId))];
  const [changes, cached] = await Promise.all([
    shareChangesFor(ids),
    latestQuotesForInstruments(db, ids).catch(() => new Map()),
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
        },
      ];
    }),
    problems: derived.problems.map((problem) => {
      const row = ledger.find((entry) => entry.id === problem.entryId);
      return `${row?.symbol ?? 'A stock'}: an entry removes more shares than you held on that date.`;
    }),
  };
  return { dto, ledger };
}

function toEntryDto(entry: HoldingEntryRow): PortfolioEntryDto {
  return {
    id: entry.id,
    symbol: entry.symbol,
    name: entry.name,
    kind: entry.kind,
    tradeDate: entry.tradeDate,
    shares: entry.shares,
    amountPaise: entry.amountPaise,
    source: entry.source,
  };
}

export async function getPortfolio(): Promise<PortfolioDto> {
  const ownerId = await requireOwnerId();
  const built = await buildPortfolio(ownerId);
  await countUse(ownerId, 'view');
  return built.dto;
}

/**
 * Phase 2 analysis: where the money sits (sector, company size, treemap), how
 * concentrated it is, what moved the gain, and plain facts worth a look. Built
 * from the same derived holdings as the overview, so the totals always agree.
 */
export async function getPortfolioAnalysis(): Promise<PortfolioAnalysisDto> {
  const ownerId = await requireOwnerId();
  const { dto } = await buildPortfolio(ownerId);
  const priced = dto.holdings.filter((h) => h.valuePaise !== null && h.valuePaise > 0);
  const reference = await holdingReference(
    getDatabase(),
    priced.map((h) => h.instrumentId),
  ).catch(() => new Map());

  const holdings: AnalysisHoldingDto[] = priced.map((h) => {
    const ref = reference.get(h.instrumentId);
    return {
      instrumentId: h.instrumentId,
      symbol: h.symbol,
      name: h.name,
      valuePaise: h.valuePaise ?? 0,
      weight: h.weight ?? 0,
      dayChangeRatio: h.dayChangeRatio,
      gainPaise: h.gainPaise,
      gainRatio: h.gainRatio,
      sector: ref?.industry ?? UNCLASSIFIED_SECTOR,
      size: companySizeByIndex(ref?.indexKeys ?? []),
    };
  });
  const sectors = groupByWeight(
    holdings.map((h) => ({ key: h.sector, valuePaise: h.valuePaise })),
  ).map((g) => ({ ...g, label: g.key }));
  const sizes = groupByWeight(holdings.map((h) => ({ key: h.size, valuePaise: h.valuePaise }))).map(
    (g) => ({ ...g, label: SIZE_LABEL[g.key as keyof typeof SIZE_LABEL] ?? g.key }),
  );
  const conc = concentration(holdings.map((h) => h.valuePaise));
  const largest = [...holdings].sort((a, b) => b.valuePaise - a.valuePaise)[0];
  const contributors = topContributors(
    holdings
      .filter((h) => h.gainPaise !== null)
      .map((h) => ({ key: h.symbol, gainPaise: h.gainPaise ?? 0 })),
    8,
  ).map((c) => ({
    symbol: c.key,
    name: holdings.find((h) => h.symbol === c.key)?.name ?? c.key,
    gainPaise: c.gainPaise,
  }));

  return {
    totals: dto.totals,
    holdingCount: dto.holdings.length,
    pricesAsOf: dto.pricesAsOf,
    pricesStale: dto.pricesStale,
    holdings,
    sectors,
    sizes,
    concentration:
      conc === null || largest === undefined ? null : { ...conc, largestName: largest.name },
    contributors,
    attention: attentionFacts({
      holdings,
      sectors,
      upcoming: dto.upcoming,
      unpriced: dto.totals.unpriced,
    }),
    upcoming: dto.upcoming,
  };
}

/** One holding with every entry behind it, or null when the user holds none of that stock. */
export async function getHoldingDetail(symbol: string): Promise<HoldingDetailDto | null> {
  const ownerId = await requireOwnerId();
  const { dto, ledger } = await buildPortfolio(ownerId);
  const wanted = symbol.toUpperCase();
  const holding = dto.holdings.find((h) => h.symbol === wanted);
  if (holding === undefined) return null;
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
});

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
  const changes = await shareChangesFor(existing.map((entry) => entry.instrumentId));
  const result = await updateHoldingEntry(
    db,
    ownerId,
    id,
    { tradeDate: input.tradeDate, shares: input.shares, amountPaise: input.totalPaise },
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

export async function previewPortfolioImport(text: string): Promise<PreviewOutcome> {
  const ownerId = await requireOwnerId();
  if (text.length > MAX_IMPORT_BYTES)
    return {
      ok: false,
      status: 413,
      code: 'FILE_TOO_LARGE',
      message: 'That file is too large to import.',
    };
  const parsed = parsePortfolioFile(text, todayInIndia());
  if (!parsed.ok) return { ok: false, status: 400, code: parsed.code, message: parsed.message };
  const resolved = await resolveRows(parsed.rows);

  const db = getDatabase();
  const existing = await listHoldingEntries(db, ownerId);
  const existingByInstrument = new Map(existing.map((entry) => [entry.instrumentId, entry.symbol]));
  const replaces =
    parsed.fileKind === 'holdings'
      ? [
          ...new Set(
            resolved
              .filter((r) => r.instrumentId !== null && r.status !== 'skipped')
              .map((r) => existingByInstrument.get(r.instrumentId ?? -1))
              .filter((s): s is string => s !== undefined),
          ),
        ]
      : [];

  const rows: ImportRowDto[] = resolved.map((r) => ({
    line: r.parsed.line,
    fileSymbol: r.parsed.symbol,
    symbol: r.symbol,
    name: r.name,
    kind: r.parsed.kind,
    tradeDate: r.parsed.tradeDate,
    shares: r.parsed.shares,
    amountPaise: r.parsed.amountPaise,
    status: r.status,
    message: r.message,
  }));
  const counts = { ready: 0, check: 0, skipped: 0 };
  for (const row of rows) counts[row.status] += 1;
  return { ok: true, preview: { fileKind: parsed.fileKind, rows, counts, replaces } };
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
  | { ok: true; inserted: number; skippedDuplicates: number; replaced: number }
  | { ok: false; status: number; code: string; message: string; remedy?: string };

export async function commitPortfolioImport(
  input: z.infer<typeof importSchema>,
): Promise<CommitOutcome> {
  const ownerId = await requireOwnerId();
  const parsed = parsePortfolioFile(input.text, todayInIndia());
  if (!parsed.ok) return { ok: false, status: 400, code: parsed.code, message: parsed.message };
  const resolved = await resolveRows(parsed.rows);
  const accepted = resolved.filter(
    (r) =>
      r.instrumentId !== null &&
      (r.status === 'ready' || (input.includeChecked && r.status === 'check')),
  );
  if (accepted.length === 0)
    return {
      ok: false,
      status: 400,
      code: 'NOTHING_TO_IMPORT',
      message: 'No rows in the file can be imported.',
      remedy: 'Check the rows marked Skipped or Check.',
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
      kind: r.parsed.kind,
      tradeDate: r.parsed.tradeDate,
      shares: r.parsed.shares,
      amountPaise: r.parsed.amountPaise,
      source: 'file' as const,
      tradeId: r.parsed.tradeId,
    })),
    ...(parsed.fileKind === 'holdings'
      ? { replaceInstrumentIds: [...new Set(instrumentIds)] }
      : {}),
    validate: (ledger) => firstProblem(ledger, changes),
  });
  if (written.ok) {
    await countUse(ownerId, 'import');
    return { ok: true, ...written.value };
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
