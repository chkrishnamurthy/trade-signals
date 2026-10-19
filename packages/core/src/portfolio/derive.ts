import type { EntryKind } from './files.js';

/**
 * Turns a user's dated entries into what they hold now, purchase by purchase.
 *
 * Method: first in, first out. Every opening or addition is a lot. A removal
 * takes shares from the earliest-acquired lots first, which is how Indian tax
 * matches sales of demat shares, and each match is a realisation with its own
 * cost, proceeds, holding period and term.
 *
 * Splits, bonuses and consolidations recorded in `corporate_actions` are applied
 * on read to every entry dated before the ex-date. Total cost never changes for
 * these; only the number of shares does. The user's rows are never rewritten.
 */

export interface PortfolioEntry {
  readonly id: number;
  readonly instrumentId: number;
  readonly kind: EntryKind;
  /** YYYY-MM-DD. For `opening`, the day the shares and cost were true. */
  readonly tradeDate: string;
  /** When the shares were really bought, if known and earlier than `tradeDate`. */
  readonly acquiredOn?: string | null;
  readonly shares: number;
  /** Total paise: cost (with charges) for opening/add, proceeds for remove. */
  readonly amountPaise: number;
}

export interface ShareChange {
  readonly instrumentId: number;
  readonly kind: string;
  readonly exDate: string;
  /** Price multiplier as stored in `corporate_actions.ratio`: 0.2 for a 1-into-5 split. */
  readonly ratio: number;
}

export interface Lot {
  /** The entry that opened the lot. */
  readonly entryId: number;
  /** Holding period starts here (the real purchase date when known). */
  readonly acquiredOn: string;
  /** Returns count from here: the entry's own date. */
  readonly trackedFrom: string;
  /** Shares still in the lot, on today's basis. */
  readonly shares: number;
  /** Cost of the shares still in the lot. */
  readonly costPaise: number;
}

export type Term = 'short' | 'long';

export interface Realisation {
  /** The removal entry. */
  readonly entryId: number;
  /** The lot the shares came from. */
  readonly lotEntryId: number;
  readonly instrumentId: number;
  readonly acquiredOn: string;
  readonly removedOn: string;
  readonly shares: number;
  readonly costPaise: number;
  readonly proceedsPaise: number;
  readonly gainPaise: number;
  readonly daysHeld: number;
  readonly term: Term;
  /** Acquired and removed on the same day: an intraday trade, not a capital gain. */
  readonly intraday: boolean;
}

export interface DerivedHolding {
  readonly instrumentId: number;
  readonly shares: number;
  /** Total cost of the shares still held, in paise (the remaining lots). */
  readonly costPaise: number;
  /** The purchases still held, oldest first. */
  readonly lots: readonly Lot[];
  /** Corporate actions that changed this holding's share count. */
  readonly adjustments: readonly {
    readonly kind: string;
    readonly exDate: string;
    readonly ratio: number;
  }[];
}

export type DeriveProblem = {
  readonly entryId: number;
  readonly code: 'REMOVES_MORE_THAN_HELD';
  readonly held: number;
};

export interface DerivedPortfolio {
  readonly holdings: readonly DerivedHolding[];
  /** Every removal matched to the lots it came from, in date order. */
  readonly realisations: readonly Realisation[];
  readonly problems: readonly DeriveProblem[];
}

const SHARE_CHANGING = new Set(['split', 'bonus', 'consolidation']);

/**
 * Shares from an entry dated `entryDate`, restated on the basis of `until`
 * (today when omitted): every split, bonus or consolidation with an ex-date after
 * the entry and on or before `until` applies.
 */
export function adjustedShares(
  shares: number,
  entryDate: string,
  changes: readonly ShareChange[],
  until?: string,
): number {
  let result = shares;
  const ordered = [...changes].sort((a, b) =>
    a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0,
  );
  for (const change of ordered) {
    if (!SHARE_CHANGING.has(change.kind) || change.ratio <= 0) continue;
    if (change.exDate > entryDate && (until === undefined || change.exDate <= until)) {
      result = Math.floor(result / change.ratio + 1e-9);
    }
  }
  return result;
}

const DAY_MS = 86_400_000;

export function daysHeldBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Long term when held MORE than twelve months: bought 10 Jan 2025, removed
 * 10 Jan 2026 is short term; removed 11 Jan 2026 is long term.
 */
export function termOf(acquiredOn: string, removedOn: string): Term {
  const a = new Date(`${acquiredOn}T00:00:00Z`);
  const anniversary = new Date(Date.UTC(a.getUTCFullYear() + 1, a.getUTCMonth(), a.getUTCDate()));
  return Date.parse(`${removedOn}T00:00:00Z`) > anniversary.getTime() ? 'long' : 'short';
}

/**
 * The order a removal draws on lots: shares added the same day first (an
 * intraday trade is matched within the day, as brokers and the tax rules treat
 * it), then the oldest acquisition first (FIFO).
 */
export function sameDayFirst<
  T extends { readonly acquiredOn: string; readonly trackedFrom: string },
>(lots: readonly T[], removedOn: string): T[] {
  const sameDay = (lot: T) => lot.trackedFrom === removedOn && lot.acquiredOn === removedOn;
  return [...lots.filter(sameDay), ...lots.filter((lot) => !sameDay(lot))];
}

/** Entries in the order they apply: by date; on one day additions before removals; then as entered. */
export function orderEntries<T extends PortfolioEntry>(entries: readonly T[]): T[] {
  const rank = (kind: EntryKind) => (kind === 'remove' ? 1 : 0);
  return [...entries].sort((a, b) =>
    a.tradeDate !== b.tradeDate
      ? a.tradeDate < b.tradeDate
        ? -1
        : 1
      : rank(a.kind) - rank(b.kind) || a.id - b.id,
  );
}

interface MutableLot {
  entryId: number;
  acquiredOn: string;
  trackedFrom: string;
  shares: number;
  costPaise: number;
}

export function derivePortfolio(
  entries: readonly PortfolioEntry[],
  changes: readonly ShareChange[],
): DerivedPortfolio {
  const state = new Map<
    number,
    { lots: MutableLot[]; adj: Map<string, { kind: string; exDate: string; ratio: number }> }
  >();
  const problems: DeriveProblem[] = [];
  const realisations: Realisation[] = [];

  for (const entry of orderEntries(entries)) {
    const mine = changes.filter((c) => c.instrumentId === entry.instrumentId);
    const shares = adjustedShares(entry.shares, entry.tradeDate, mine);
    const cur = state.get(entry.instrumentId) ?? { lots: [] as MutableLot[], adj: new Map() };
    state.set(entry.instrumentId, cur);
    if (shares !== entry.shares) {
      for (const c of mine) {
        if (SHARE_CHANGING.has(c.kind) && c.exDate > entry.tradeDate)
          cur.adj.set(`${c.kind}|${c.exDate}`, { kind: c.kind, exDate: c.exDate, ratio: c.ratio });
      }
    }

    if (entry.kind !== 'remove') {
      const acquiredOn = entry.acquiredOn ?? entry.tradeDate;
      cur.lots.push({
        entryId: entry.id,
        acquiredOn,
        trackedFrom: entry.tradeDate,
        shares,
        costPaise: entry.amountPaise,
      });
      // Oldest acquisition first; equal dates keep the order entered.
      cur.lots.sort((a, b) =>
        a.acquiredOn < b.acquiredOn ? -1 : a.acquiredOn > b.acquiredOn ? 1 : 0,
      );
      continue;
    }

    const held = cur.lots.reduce((a, l) => a + l.shares, 0);
    if (shares > held) {
      problems.push({ entryId: entry.id, code: 'REMOVES_MORE_THAN_HELD', held });
      continue;
    }
    let left = shares;
    let proceedsLeft = entry.amountPaise;
    for (const lot of sameDayFirst(cur.lots, entry.tradeDate)) {
      if (left === 0) break;
      if (lot.shares === 0) continue;
      const take = Math.min(left, lot.shares);
      const costOut =
        take === lot.shares ? lot.costPaise : Math.round((lot.costPaise * take) / lot.shares);
      // Proceeds are shared out by shares; the last piece takes the remainder so
      // the pieces add up to the entry exactly.
      const proceeds =
        take === left ? proceedsLeft : Math.round((entry.amountPaise * take) / shares);
      lot.shares -= take;
      lot.costPaise -= costOut;
      left -= take;
      proceedsLeft -= proceeds;
      realisations.push({
        entryId: entry.id,
        lotEntryId: lot.entryId,
        instrumentId: entry.instrumentId,
        acquiredOn: lot.acquiredOn,
        removedOn: entry.tradeDate,
        shares: take,
        costPaise: costOut,
        proceedsPaise: proceeds,
        gainPaise: proceeds - costOut,
        daysHeld: daysHeldBetween(lot.acquiredOn, entry.tradeDate),
        term: termOf(lot.acquiredOn, entry.tradeDate),
        intraday: lot.trackedFrom === entry.tradeDate && lot.acquiredOn === entry.tradeDate,
      });
    }
    cur.lots = cur.lots.filter((l) => l.shares > 0);
  }

  const holdings: DerivedHolding[] = [];
  for (const [instrumentId, s] of state) {
    const shares = s.lots.reduce((a, l) => a + l.shares, 0);
    if (shares <= 0) continue;
    holdings.push({
      instrumentId,
      shares,
      costPaise: s.lots.reduce((a, l) => a + l.costPaise, 0),
      lots: s.lots.map((l) => ({ ...l })),
      adjustments: [...s.adj.values()],
    });
  }
  return { holdings, realisations, problems };
}

/**
 * Entries that, on their own date, would remove more than was held. Used to
 * refuse a save before it reaches the database.
 */
export function wouldGoNegative(
  existing: readonly PortfolioEntry[],
  proposed: PortfolioEntry,
  changes: readonly ShareChange[],
): { held: number } | null {
  const result = derivePortfolio([...existing, proposed], changes);
  const problem = result.problems.find((p) => p.entryId === proposed.id);
  if (problem !== undefined) return { held: problem.held };
  // A new dated entry can also make a LATER removal invalid.
  const other = result.problems[0];
  return other === undefined ? null : { held: other.held };
}
