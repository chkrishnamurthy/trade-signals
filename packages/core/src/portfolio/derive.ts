import type { EntryKind } from './files.js';

/**
 * Turns a user's dated entries into what they hold now.
 *
 * Method: average cost. Adding shares adds to the total cost. Removing shares
 * takes out cost in proportion to the share of the holding removed. (Per-purchase
 * lots, which the tax view needs, come in a later phase; this is the same data
 * read a finer way, so no migration is needed then.)
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

export interface DerivedHolding {
  readonly instrumentId: number;
  readonly shares: number;
  /** Total cost of the shares still held, in paise. */
  readonly costPaise: number;
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
  readonly problems: readonly DeriveProblem[];
}

const SHARE_CHANGING = new Set(['split', 'bonus', 'consolidation']);

export function adjustedShares(
  shares: number,
  entryDate: string,
  changes: readonly ShareChange[],
): number {
  let result = shares;
  for (const change of changes) {
    if (!SHARE_CHANGING.has(change.kind) || change.ratio <= 0) continue;
    if (change.exDate > entryDate) result = Math.floor(result / change.ratio + 1e-9);
  }
  return result;
}

export function derivePortfolio(
  entries: readonly PortfolioEntry[],
  changes: readonly ShareChange[],
): DerivedPortfolio {
  // By date; on one day, shares added before shares removed (an intraday round trip
  // can be listed in either order), then in the order entered.
  const rank = (kind: EntryKind) => (kind === 'remove' ? 1 : 0);
  const ordered = [...entries].sort((a, b) =>
    a.tradeDate !== b.tradeDate
      ? a.tradeDate < b.tradeDate
        ? -1
        : 1
      : rank(a.kind) - rank(b.kind) || a.id - b.id,
  );
  const state = new Map<
    number,
    {
      shares: number;
      cost: number;
      adj: Map<string, { kind: string; exDate: string; ratio: number }>;
    }
  >();
  const problems: DeriveProblem[] = [];

  for (const entry of ordered) {
    const mine = changes.filter((c) => c.instrumentId === entry.instrumentId);
    const shares = adjustedShares(entry.shares, entry.tradeDate, mine);
    const cur = state.get(entry.instrumentId) ?? { shares: 0, cost: 0, adj: new Map() };
    if (shares !== entry.shares) {
      for (const c of mine) {
        if (SHARE_CHANGING.has(c.kind) && c.exDate > entry.tradeDate)
          cur.adj.set(`${c.kind}|${c.exDate}`, { kind: c.kind, exDate: c.exDate, ratio: c.ratio });
      }
    }
    if (entry.kind === 'remove') {
      if (shares > cur.shares) {
        problems.push({ entryId: entry.id, code: 'REMOVES_MORE_THAN_HELD', held: cur.shares });
        state.set(entry.instrumentId, cur);
        continue;
      }
      const costOut =
        shares === cur.shares ? cur.cost : Math.round((cur.cost * shares) / cur.shares);
      cur.shares -= shares;
      cur.cost -= costOut;
    } else {
      cur.shares += shares;
      cur.cost += entry.amountPaise;
    }
    state.set(entry.instrumentId, cur);
  }

  const holdings: DerivedHolding[] = [];
  for (const [instrumentId, s] of state) {
    if (s.shares <= 0) continue;
    holdings.push({
      instrumentId,
      shares: s.shares,
      costPaise: s.cost,
      adjustments: [...s.adj.values()],
    });
  }
  return { holdings, problems };
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
