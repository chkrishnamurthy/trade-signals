/**
 * What a holdings snapshot (a broker's "shares you hold today" file) should do
 * to a stock the user already has entries for.
 *
 * A snapshot never deletes or rewrites the user's dated entries: those carry the
 * history that returns and tax depend on. Instead it compares the file's share
 * count with what the entries add up to, and either does nothing or records the
 * difference as one new entry dated today, for a person to confirm.
 */

export type ReconcileAction = 'opening' | 'skip' | 'add' | 'remove' | 'cannot';

export interface ReconcileInput {
  /** Shares and total cost the file says the user holds today. */
  readonly fileShares: number;
  readonly fileAmountPaise: number;
  /** What the user's entries add up to today, or null when they have none for this stock. */
  readonly current: { readonly shares: number; readonly costPaise: number } | null;
  /** Today's price a share, for recording a removal; null when there is none. */
  readonly pricePaise: number | null;
}

export interface ReconcileResult {
  readonly action: ReconcileAction;
  /** Shares and amount of the entry to write (zero for skip / cannot). */
  readonly shares: number;
  readonly amountPaise: number;
  readonly status: 'ready' | 'check' | 'skipped';
  readonly message: string;
}

export function reconcileHolding(input: ReconcileInput): ReconcileResult {
  const { fileShares, fileAmountPaise, current, pricePaise } = input;
  if (current === null || current.shares === 0) {
    return {
      action: 'opening',
      shares: fileShares,
      amountPaise: fileAmountPaise,
      status: 'ready',
      message: `Ready: ${fileShares} shares you hold today.`,
    };
  }
  if (current.shares === fileShares) {
    return {
      action: 'skip',
      shares: 0,
      amountPaise: 0,
      status: 'skipped',
      message: `Already matches your entries (${fileShares} shares). Nothing to change.`,
    };
  }
  const difference = Math.abs(fileShares - current.shares);
  if (fileShares > current.shares) {
    // Priced at the file's own average cost a share: the one figure the file gives
    // for shares the entries do not know about.
    const amountPaise = Math.round((fileAmountPaise * difference) / fileShares);
    return {
      action: 'add',
      shares: difference,
      amountPaise,
      status: 'check',
      message: `Check: your entries add up to ${current.shares} shares; the file says ${fileShares}. Importing adds ${difference} shares dated today at the file's average cost.`,
    };
  }
  if (pricePaise === null || pricePaise <= 0) {
    return {
      action: 'cannot',
      shares: 0,
      amountPaise: 0,
      status: 'skipped',
      message: `Skipped: your entries add up to ${current.shares} shares; the file says ${fileShares}. There is no price today to record the ${difference} removed, so please add that entry yourself.`,
    };
  }
  return {
    action: 'remove',
    shares: difference,
    amountPaise: difference * pricePaise,
    status: 'check',
    message: `Check: your entries add up to ${current.shares} shares; the file says ${fileShares}. Importing records ${difference} shares removed today at today's price. If you removed them on another day, add that entry instead.`,
  };
}
