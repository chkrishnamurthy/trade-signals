import type { IntradaySkipReason } from '@equitywise/shared';
import { ORB_CONFIG, type OrbConfig } from './config.js';

/** The shared paper book as it stands when a candle's signals arrive. */
export interface BookState {
  capitalPaise: number;
  tradesToday: number;
  openTrades: number;
  /** Realised plus marked open result so far today, paise. */
  dayNetPaise: number;
}
export interface Candidate {
  symbol: string;
  relativeVolume: number;
}

/**
 * Which of one candle's signals the book takes. Deterministic: strongest
 * relative volume first, symbol A→Z on ties. Returns a skip reason per symbol
 * (null = taken). Signals not taken are still published and tracked.
 */
export function allocateCandidates(
  candidates: readonly Candidate[],
  book: BookState,
  config: OrbConfig = ORB_CONFIG,
): Map<string, IntradaySkipReason | null> {
  const out = new Map<string, IntradaySkipReason | null>();
  const halted =
    book.dayNetPaise <= -Math.floor((book.capitalPaise * config.dailyLossHaltBps) / 10_000);
  let trades = book.tradesToday;
  let open = book.openTrades;
  const ordered = [...candidates].sort(
    (a, b) => b.relativeVolume - a.relativeVolume || a.symbol.localeCompare(b.symbol),
  );
  for (const c of ordered) {
    if (out.has(c.symbol)) continue;
    if (halted) out.set(c.symbol, 'LOSS_HALT');
    else if (trades >= config.maxTradesPerDay) out.set(c.symbol, 'DAILY_LIMIT');
    else if (open >= config.maxOpenTrades) out.set(c.symbol, 'OPEN_LIMIT');
    else {
      out.set(c.symbol, null);
      trades += 1;
      open += 1;
    }
  }
  return out;
}
