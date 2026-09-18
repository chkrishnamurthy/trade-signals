/**
 * What the engine knows about a portfolio at decision time. Built by the
 * repository from the ledger and open positions; the engine only reads it.
 * Every amount is integer paise.
 */
export interface PortfolioState {
  /** cash + reserved + locked + unrealised (marked) — the base for every bps limit. */
  equityPaise: number;
  /** Free cash: not reserved by a pending order, not locked in an open trade. */
  cashPaise: number;
  reservedPaise: number;
  lockedPaise: number;
  /** Notional of open and pending trades, by instrument id and by sector. */
  exposureByInstrument: ReadonlyMap<number, number>;
  exposureBySector: ReadonlyMap<string, number>;
  totalExposurePaise: number;
  openPositions: number;
  /** Taken trades today, including those still pending a fill. */
  tradesToday: number;
  /** Realised plus marked net result since the session opened. */
  dayNetPaise: number;
  startOfDayEquityPaise: number;
  peakEquityPaise: number;
  /** Instruments with a live (pending or open) paper trade. */
  liveInstruments: ReadonlySet<number>;
  /** `${strategyId}:${instrumentId}:${sessionDate}` of every intent already decided. */
  decidedKeys: ReadonlySet<string>;
}

export function emptyPortfolioState(capitalPaise: number): PortfolioState {
  return {
    equityPaise: capitalPaise,
    cashPaise: capitalPaise,
    reservedPaise: 0,
    lockedPaise: 0,
    exposureByInstrument: new Map(),
    exposureBySector: new Map(),
    totalExposurePaise: 0,
    openPositions: 0,
    tradesToday: 0,
    dayNetPaise: 0,
    startOfDayEquityPaise: capitalPaise,
    peakEquityPaise: capitalPaise,
    liveInstruments: new Set(),
    decidedKeys: new Set(),
  };
}

/** A pending (accepted, unfilled) order's claim on the portfolio. */
export interface PendingClaim {
  instrumentId: number;
  sector: string | null;
  notionalPaise: number;
}

/**
 * Builds the decision-time state from the ledger balances, the open and
 * pending trades and their marks. Shared by the replay and the repository so
 * both sides of the daily check see the same numbers.
 */
export function buildPortfolioState(input: {
  balances: { cashPaise: number; reservedPaise: number; lockedPaise: number };
  open: readonly {
    instrumentId: number;
    sector: string | null;
    lockedPaise: number;
    markNetPaise: number | null;
    netRealisedPaise: number;
  }[];
  pending: readonly PendingClaim[];
  /** Net realised today across closed trades. */
  realisedTodayPaise: number;
  startOfDayEquityPaise: number;
  peakEquityPaise: number;
  tradesToday: number;
  decidedKeys: ReadonlySet<string>;
}): PortfolioState {
  const exposureByInstrument = new Map<number, number>();
  const exposureBySector = new Map<string, number>();
  let total = 0;
  const live = new Set<number>();
  const add = (instrumentId: number, sector: string | null, notional: number) => {
    exposureByInstrument.set(
      instrumentId,
      (exposureByInstrument.get(instrumentId) ?? 0) + notional,
    );
    if (sector !== null)
      exposureBySector.set(sector, (exposureBySector.get(sector) ?? 0) + notional);
    total += notional;
    live.add(instrumentId);
  };
  let unrealised = 0;
  for (const p of input.open) {
    add(p.instrumentId, p.sector, p.lockedPaise);
    if (p.markNetPaise !== null) unrealised += p.markNetPaise - p.netRealisedPaise;
  }
  for (const c of input.pending) add(c.instrumentId, c.sector, c.notionalPaise);
  const { cashPaise, reservedPaise, lockedPaise } = input.balances;
  const equity = cashPaise + reservedPaise + lockedPaise + unrealised;
  return {
    equityPaise: equity,
    cashPaise,
    reservedPaise,
    lockedPaise,
    exposureByInstrument,
    exposureBySector,
    totalExposurePaise: total,
    openPositions: input.open.length + input.pending.length,
    tradesToday: input.tradesToday,
    dayNetPaise:
      input.realisedTodayPaise +
      unrealised +
      input.open.reduce((s, p) => s + p.netRealisedPaise, 0),
    startOfDayEquityPaise: input.startOfDayEquityPaise,
    peakEquityPaise: Math.max(input.peakEquityPaise, equity),
    liveInstruments: live,
    decidedKeys: input.decidedKeys,
  };
}
