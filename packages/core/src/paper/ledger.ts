import type { PaperLedgerEntry, PaperLedgerKind } from '@equitywise/shared';

/**
 * The virtual cash book (docs/planning/paper-trading-plan.md §7.2, "paper_ledger_entries").
 *
 * Three balances: free CASH, cash RESERVED by accepted-but-unfilled orders,
 * and cost basis LOCKED in open trades. Equity = cash + reserved + locked +
 * unrealised. Every entry records all three balances after itself, so the
 * book is reconstructable from the entries alone and any drift is provable.
 */
export interface LedgerBalances {
  cashPaise: number;
  reservedPaise: number;
  lockedPaise: number;
}
export type LedgerDraft = Omit<
  PaperLedgerEntry,
  'sequence' | 'cashAfterPaise' | 'reservedAfterPaise' | 'lockedAfterPaise' | 'lockedDeltaPaise'
> & { lockedDeltaPaise?: number };

const KIND_EFFECT: Record<PaperLedgerKind, (b: LedgerBalances, amount: number) => LedgerBalances> =
  {
    OPENING_BALANCE: (b, a) => ({ ...b, cashPaise: b.cashPaise + a }),
    // Reserve moves free cash into "reserved"; the ledger amount is the cash effect (negative).
    RESERVE: (b, a) => ({ ...b, cashPaise: b.cashPaise + a, reservedPaise: b.reservedPaise - a }),
    RELEASE: (b, a) => ({ ...b, cashPaise: b.cashPaise + a, reservedPaise: b.reservedPaise - a }),
    // Entry moves free cash into cost basis locked in the trade.
    ENTRY: (b, a) => ({ ...b, cashPaise: b.cashPaise + a, lockedPaise: b.lockedPaise - a }),
    // Exit returns cost basis plus the gross result to free cash; `locked` is reduced by the cost part only.
    EXIT: (b, a) => ({ ...b, cashPaise: b.cashPaise + a }),
    CHARGES: (b, a) => ({ ...b, cashPaise: b.cashPaise + a }),
    ADJUSTMENT_RECONCILE: (b, a) => ({ ...b, cashPaise: b.cashPaise + a }),
  };

export function openingBalances(): LedgerBalances {
  return { cashPaise: 0, reservedPaise: 0, lockedPaise: 0 };
}

/**
 * Appends one draft to the book. `lockedDelta` is the cost-basis movement an
 * EXIT carries (negative, the cost part of what was returned), which the
 * signed cash amount alone cannot express.
 */
export function appendLedger(
  balances: LedgerBalances,
  lastSequence: number,
  draft: LedgerDraft,
): { entry: PaperLedgerEntry; balances: LedgerBalances } {
  if (!Number.isSafeInteger(draft.amountPaise))
    throw new RangeError('Ledger amount must be integer paise');
  const lockedDelta = draft.kind === 'EXIT' ? (draft.lockedDeltaPaise ?? 0) : 0;
  let next = KIND_EFFECT[draft.kind](balances, draft.amountPaise);
  if (draft.kind === 'EXIT') next = { ...next, lockedPaise: next.lockedPaise + lockedDelta };
  if (next.cashPaise < 0 || next.reservedPaise < 0 || next.lockedPaise < 0)
    throw new RangeError(`Ledger would go negative on ${draft.kind} ${draft.idempotencyKey}`);
  const entry: PaperLedgerEntry = {
    ...draft,
    lockedDeltaPaise: lockedDelta,
    sequence: lastSequence + 1,
    cashAfterPaise: next.cashPaise,
    reservedAfterPaise: next.reservedPaise,
    lockedAfterPaise: next.lockedPaise,
  };
  return { entry, balances: next };
}

export const ledgerKey = (
  portfolioId: number,
  refKind: LedgerDraft['refKind'],
  refId: number,
  kind: PaperLedgerKind,
  leg = 0,
) => `${portfolioId}:${refKind}:${refId}:${kind}:${leg}`;

/** Draft builders. Amounts are the signed effect on free cash. */
export const ledgerDrafts = {
  opening: (portfolioId: number, at: number, capitalPaise: number): LedgerDraft => ({
    at,
    kind: 'OPENING_BALANCE',
    amountPaise: capitalPaise,
    refKind: 'portfolio',
    refId: portfolioId,
    idempotencyKey: ledgerKey(portfolioId, 'portfolio', portfolioId, 'OPENING_BALANCE'),
  }),
  reserve: (
    portfolioId: number,
    orderId: number,
    at: number,
    reservePaise: number,
  ): LedgerDraft => ({
    at,
    kind: 'RESERVE',
    amountPaise: -reservePaise,
    refKind: 'order',
    refId: orderId,
    idempotencyKey: ledgerKey(portfolioId, 'order', orderId, 'RESERVE'),
  }),
  release: (
    portfolioId: number,
    orderId: number,
    at: number,
    reservePaise: number,
  ): LedgerDraft => ({
    at,
    kind: 'RELEASE',
    amountPaise: reservePaise,
    refKind: 'order',
    refId: orderId,
    idempotencyKey: ledgerKey(portfolioId, 'order', orderId, 'RELEASE'),
  }),
  entry: (portfolioId: number, fillId: number, at: number, costPaise: number): LedgerDraft => ({
    at,
    kind: 'ENTRY',
    amountPaise: -costPaise,
    refKind: 'fill',
    refId: fillId,
    idempotencyKey: ledgerKey(portfolioId, 'fill', fillId, 'ENTRY'),
  }),
  exit: (
    portfolioId: number,
    fillId: number,
    at: number,
    returnedPaise: number,
    costPortionPaise: number,
  ): LedgerDraft => ({
    at,
    kind: 'EXIT',
    amountPaise: returnedPaise,
    lockedDeltaPaise: -costPortionPaise,
    refKind: 'fill',
    refId: fillId,
    idempotencyKey: ledgerKey(portfolioId, 'fill', fillId, 'EXIT'),
  }),
  charges: (
    portfolioId: number,
    fillId: number,
    at: number,
    chargesPaise: number,
  ): LedgerDraft => ({
    at,
    kind: 'CHARGES',
    amountPaise: -chargesPaise,
    refKind: 'fill',
    refId: fillId,
    idempotencyKey: ledgerKey(portfolioId, 'fill', fillId, 'CHARGES'),
  }),
};

/** Replays the book and reports the first entry whose recorded balances disagree. */
export function reconstructLedger(entries: readonly PaperLedgerEntry[]): {
  balances: LedgerBalances;
  mismatches: { sequence: number; field: string; recorded: number; computed: number }[];
} {
  let balances = openingBalances();
  const mismatches: { sequence: number; field: string; recorded: number; computed: number }[] = [];
  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  for (const e of sorted) {
    balances = KIND_EFFECT[e.kind](balances, e.amountPaise);
    if (e.kind === 'EXIT')
      balances = { ...balances, lockedPaise: balances.lockedPaise + e.lockedDeltaPaise };
    for (const [field, recorded, computed] of [
      ['cashAfterPaise', e.cashAfterPaise, balances.cashPaise],
      ['reservedAfterPaise', e.reservedAfterPaise, balances.reservedPaise],
      ['lockedAfterPaise', e.lockedAfterPaise, balances.lockedPaise],
    ] as const)
      if (recorded !== computed)
        mismatches.push({ sequence: e.sequence, field, recorded, computed });
  }
  return { balances, mismatches };
}
