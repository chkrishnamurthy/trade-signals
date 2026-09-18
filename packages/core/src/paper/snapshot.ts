import type { PaperPosition } from '@equitywise/shared';
import type { LedgerBalances } from './ledger.js';

export interface EquitySnapshot {
  cashPaise: number;
  reservedPaise: number;
  lockedPaise: number;
  /** Open trades marked at the last price with exit slippage; null when any mark is missing. */
  unrealisedPaise: number | null;
  equityPaise: number | null;
  exposurePaise: number;
  peakEquityPaise: number;
  drawdownPaise: number | null;
  marksComplete: boolean;
}

/**
 * Equity = cash + reserved + locked + unrealised. Unrealised uses the same
 * per-leg net as a real exit would (see `markNet`), so a snapshot never shows
 * a profit the square-off could not realise.
 */
export function equitySnapshot(
  balances: LedgerBalances,
  open: readonly { position: PaperPosition; markNetPaise: number | null }[],
  previousPeakPaise: number,
): EquitySnapshot {
  let unrealised: number | null = 0;
  let exposure = 0;
  for (const { position, markNetPaise } of open) {
    exposure += position.lockedPaise;
    if (markNetPaise === null || position.projection.resolution === 'UNAVAILABLE') {
      unrealised = null;
      continue;
    }
    if (unrealised !== null) unrealised += markNetPaise - position.netRealisedPaise;
  }
  const base = balances.cashPaise + balances.reservedPaise + balances.lockedPaise;
  const equity = unrealised === null ? null : base + unrealised;
  const peak = equity === null ? previousPeakPaise : Math.max(previousPeakPaise, equity);
  return {
    cashPaise: balances.cashPaise,
    reservedPaise: balances.reservedPaise,
    lockedPaise: balances.lockedPaise,
    unrealisedPaise: unrealised,
    equityPaise: equity,
    exposurePaise: exposure,
    peakEquityPaise: peak,
    drawdownPaise: equity === null ? null : peak - equity,
    marksComplete: unrealised !== null,
  };
}
